import argparse
import json
import re
import unicodedata
import zipfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = Path(r"D:\문서\자료_프로젝트\집현전\상가 임대료AI")
DEFAULT_COLAB_DATA_DIR = Path("/content/drive/MyDrive/집현전/상가 임대료AI")
SUPPORTED_DATA_SUFFIXES = (".csv", ".xlsx", ".xls")

FEATURE_COLUMNS = [
    "sigungu",
    "commercial_type",
    "building_use",
    "zoning",
    "road_condition",
    "area_m2",
    "area_bin",
    "land_area_m2",
    "floor",
    "floor_bin",
    "built_year",
    "building_age",
    "lat",
    "lng",
    "bus_boarding_500m",
    "bus_alighting_500m",
    "subway_boarding_500m",
    "subway_alighting_500m",
    "year",
    "month",
    "quarter",
    "reb_income_yield",
    "reb_capital_yield",
    "reb_investment_yield",
    "reb_regional_rent",
    "reb_rent_index",
    "reb_noi",
    "reb_floor_utility",
]

CATEGORICAL_COLUMNS = [
    "sigungu",
    "commercial_type",
    "building_use",
    "zoning",
    "road_condition",
    "area_bin",
    "floor_bin",
    "quarter",
]

HORIZON_MONTHS = {
    "h1m": 1,
    "h3m": 3,
    "h6m": 6,
}

PANEL_GROUP_COLUMNS = [
    "sigungu",
    "commercial_type",
    "building_use",
    "zoning",
    "road_condition",
    "area_bin",
    "floor_bin",
]

STORE_TYPE_FILES = {
    "소규모 상가": "소규모 상가",
    "중대형 상가": "중대형 상가",
    "집합 상가": "집합 상가",
    "오피스": "오피스",
}


def read_csv_with_fallback(path: Path, encodings: Iterable[str]) -> pd.DataFrame:
    last_error: Optional[Exception] = None
    for encoding in encodings:
        try:
            return pd.read_csv(path, encoding=encoding)
        except UnicodeDecodeError as exc:
            last_error = exc
    raise last_error or RuntimeError(f"Failed to read {path}")


def read_table_with_fallback(path: Path, encodings: Iterable[str]) -> pd.DataFrame:
    if path.suffix.lower() in [".xlsx", ".xls"]:
        return pd.read_excel(path)
    return read_csv_with_fallback(path, encodings)


def normalize_lookup_text(value: str) -> str:
    text = unicodedata.normalize("NFC", str(value))
    return re.sub(r"[\s_\-()~]+", "", text).lower()


def find_folder(parent: Path, folder_name: str) -> Path:
    direct = parent / folder_name
    if direct.exists():
        return direct

    target = normalize_lookup_text(folder_name)
    candidates = [p for p in parent.iterdir() if p.is_dir()]
    matches = [p for p in candidates if target == normalize_lookup_text(p.name)]
    if not matches:
        available = "\n".join(f"- {p.name}" for p in candidates[:50])
        if len(candidates) > 50:
            available += f"\n... and {len(candidates) - 50} more"
        raise FileNotFoundError(
            f"Data folder does not exist: {direct}\n"
            f"Available folders:\n{available or '(none)'}"
        )
    return sorted(matches, key=lambda p: (len(p.name), p.name))[0]


def to_number(series: pd.Series) -> pd.Series:
    return pd.to_numeric(
        series.astype(str)
        .str.replace(",", "", regex=False)
        .str.replace(" ", "", regex=False)
        .replace({"": np.nan, "-": np.nan, "nan": np.nan}),
        errors="coerce",
    )


def quarter_col_to_key(col: str) -> Optional[str]:
    match = re.search(r"(20\d{2})년\s*(\d)분기", col)
    if not match:
        return None
    return f"{match.group(1)}Q{match.group(2)}"


def contract_ym_to_quarter(value) -> str:
    ym = str(int(value))
    return f"{ym[:4]}Q{((int(ym[4:6]) - 1) // 3) + 1}"


def shift_yyyymm(yyyymm: int, month_shift: int) -> int:
    year = yyyymm // 100
    month = yyyymm % 100
    total = year * 12 + (month - 1) + month_shift
    shifted_year = total // 12
    shifted_month = (total % 12) + 1
    return shifted_year * 100 + shifted_month


def normalize_sigungu(value: str) -> str:
    parts = str(value).split()
    if len(parts) >= 2 and parts[0] in ["서울", "서울특별시"]:
        return parts[1]
    return str(value).strip() or "unknown"


def map_commercial_type(raw_type: str, building_use: str) -> str:
    raw = str(raw_type)
    use = str(building_use)
    if "오피스" in use or "업무" in use:
        return "오피스"
    if "집합" in raw:
        return "집합 상가"
    if "일반" in raw:
        return "중대형 상가"
    return "소규모 상가"


def load_trade_data(data_dir: Path) -> pd.DataFrame:
    path = find_file(data_dir, "상업업무용 실거래가 통합")
    raw = read_table_with_fallback(path, ["cp949", "utf-8-sig", "utf-8"])
    df = pd.DataFrame()
    df["sigungu"] = raw["시군구"].map(normalize_sigungu)
    df["commercial_type"] = [
        map_commercial_type(t, u) for t, u in zip(raw["유형"], raw["건축물주용도"])
    ]
    df["building_use"] = raw["건축물주용도"].fillna("unknown").astype(str)
    df["zoning"] = raw["용도지역"].fillna("unknown").astype(str)
    df["road_condition"] = raw["도로조건"].fillna("unknown").astype(str)
    df["area_m2"] = to_number(raw["전용/연면적(㎡)"])
    df["land_area_m2"] = to_number(raw["대지면적(㎡)"])
    df["trade_amount"] = to_number(raw["거래금액(만원)"])
    df["floor"] = to_number(raw["층"])
    df["built_year"] = to_number(raw["건축년도"])
    df["lat"] = to_number(raw["위도"])
    df["lng"] = to_number(raw["경도"])
    df["bus_boarding_500m"] = to_number(raw["반경500m_버스승차_총합"])
    df["bus_alighting_500m"] = to_number(raw["반경500m_버스하차_총합"])
    df["subway_boarding_500m"] = to_number(raw["반경500m_지하철승차_총합"])
    df["subway_alighting_500m"] = to_number(raw["반경500m_지하철하차_총합"])
    df["contract_ym"] = to_number(raw["계약년월"]).astype("Int64")
    df["year"] = (df["contract_ym"] // 100).astype("Int64")
    df["month"] = (df["contract_ym"] % 100).astype("Int64")
    df["quarter"] = df["contract_ym"].map(contract_ym_to_quarter)
    df["building_age"] = df["year"].astype(float) - df["built_year"]
    df["trade_amount_per_m2"] = df["trade_amount"] / df["area_m2"]
    return df


def find_file(folder: Path, type_name: str) -> Path:
    if not folder.exists():
        raise FileNotFoundError(f"Data folder does not exist: {folder}")

    target = normalize_lookup_text(type_name)
    candidates = [
        p
        for p in folder.rglob("*")
        if p.is_file() and p.suffix.lower() in SUPPORTED_DATA_SUFFIXES
    ]
    matches = [p for p in candidates if target in normalize_lookup_text(p.stem)]
    if not matches:
        available = "\n".join(f"- {p.relative_to(folder)}" for p in candidates[:50])
        if len(candidates) > 50:
            available += f"\n... and {len(candidates) - 50} more"
        raise FileNotFoundError(
            f"No data file for '{type_name}' in {folder}\n"
            f"Supported extensions: {', '.join(SUPPORTED_DATA_SUFFIXES)}\n"
            f"Available files:\n{available or '(none)'}"
        )
    return sorted(matches, key=lambda p: (len(p.parts), len(p.name), p.name))[0]


def melt_simple_quarter_file(path: Path, value_name: str, commercial_type: str) -> pd.DataFrame:
    raw = read_table_with_fallback(path, ["utf-8-sig", "utf-8", "cp949"])
    id_cols = [c for c in ["대분류", "중분류", "소분류"] if c in raw.columns]
    value_cols = [c for c in raw.columns if quarter_col_to_key(c)]
    rows = raw.melt(id_vars=id_cols, value_vars=value_cols, var_name="quarter_col", value_name=value_name)
    rows["quarter"] = rows["quarter_col"].map(quarter_col_to_key)
    rows["commercial_type"] = commercial_type
    rows["sigungu"] = rows.get("대분류", "").astype(str)
    rows[value_name] = to_number(rows[value_name])
    return rows[["sigungu", "commercial_type", "quarter", value_name]]


def melt_multi_header_file(path: Path, wanted_metrics: Dict[str, str], commercial_type: str) -> pd.DataFrame:
    raw = read_table_with_fallback(path, ["utf-8-sig", "utf-8", "cp949"])
    metric_row = list(raw.iloc[0])
    data = raw[raw.iloc[:, 0].astype(str).str.match(r"^\d+$", na=False)].copy()
    records = []
    for idx, col in enumerate(raw.columns):
        quarter = quarter_col_to_key(str(col))
        if not quarter:
            continue
        metric = str(metric_row[idx])
        if metric not in wanted_metrics:
            continue
        out_name = wanted_metrics[metric]
        records.append(
            pd.DataFrame(
                {
                    "sigungu": data.iloc[:, 1].astype(str),
                    "commercial_type": commercial_type,
                    "quarter": quarter,
                    out_name: to_number(data[col]),
                }
            )
        )
    if not records:
        return pd.DataFrame(columns=["sigungu", "commercial_type", "quarter", *wanted_metrics.values()])

    key_cols = ["sigungu", "commercial_type", "quarter"]
    merged = pd.concat(records, ignore_index=True, sort=False)
    value_cols = [c for c in merged.columns if c not in key_cols]
    return merged.groupby(key_cols, as_index=False)[value_cols].mean(numeric_only=True)


def load_reb_features(data_dir: Path) -> pd.DataFrame:
    rent_dir = find_folder(data_dir, "24q1~26q1 임대동향 지역별 임대료")
    rent_index_dir = find_folder(data_dir, "24q1~26q1 임대동향 지역별 임대가격지수(시계열)")
    floor_dir = find_folder(data_dir, "24q1~26q1 임대동향 층별임대료 및 층별효용비율")
    yield_dir = find_folder(data_dir, "24q1~26q1 임대동향 수익률(분기)")
    noi_dir = find_folder(data_dir, "24q1~26q1 임대동향 순영업소득")

    frames = []
    for commercial_type, file_key in STORE_TYPE_FILES.items():
        rent_path = find_file(rent_dir, file_key)
        rent_index_key = file_key if commercial_type != "오피스" else "통합 상가"
        rent_index_path = find_file(rent_index_dir, rent_index_key)
        floor_path = find_file(floor_dir, file_key)
        yield_path = find_file(yield_dir, file_key)
        noi_path = find_file(noi_dir, file_key)

        merged = melt_simple_quarter_file(rent_path, "reb_regional_rent", commercial_type)
        for add in [
            melt_multi_header_file(rent_index_path, {"지수": "reb_rent_index"}, commercial_type),
            melt_multi_header_file(
                yield_path,
                {
                    "소득수익률": "reb_income_yield",
                    "자본수익률": "reb_capital_yield",
                    "투자수익률": "reb_investment_yield",
                },
                commercial_type,
            ),
            melt_multi_header_file(noi_path, {"순영업소득(천원/㎡)": "reb_noi"}, commercial_type),
            melt_simple_quarter_file(floor_path, "reb_floor_utility", commercial_type),
        ]:
            merged = merged.merge(add, on=["sigungu", "commercial_type", "quarter"], how="outer")
        frames.append(merged)
    return pd.concat(frames, ignore_index=True)


def add_reb_features(trades: pd.DataFrame, reb: pd.DataFrame) -> pd.DataFrame:
    seoul_reb = reb[reb["sigungu"].isin(["서울", "전국"])].copy()
    seoul_reb = seoul_reb.drop_duplicates(["commercial_type", "quarter"], keep="first")
    merged = trades.merge(seoul_reb.drop(columns=["sigungu"]), on=["commercial_type", "quarter"], how="left")
    reb_cols = [
        "reb_income_yield",
        "reb_capital_yield",
        "reb_investment_yield",
        "reb_regional_rent",
        "reb_rent_index",
        "reb_noi",
        "reb_floor_utility",
    ]
    for col in reb_cols:
        merged[col] = merged[col].fillna(merged.groupby("commercial_type")[col].transform("median"))
        merged[col] = merged[col].fillna(merged[col].median())
    return merged


def prepare_training_frame(data_dir: Path) -> pd.DataFrame:
    df = add_reb_features(load_trade_data(data_dir), load_reb_features(data_dir))
    df["observed_rent"] = df["trade_amount"] * (df["reb_income_yield"] / 100.0) / 12.0
    df["yyyymm"] = (df["year"].astype(float) * 100 + df["month"].astype(float)).astype("Int64")
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(subset=["observed_rent", "area_m2", "trade_amount", "yyyymm"])
    df = df[(df["observed_rent"] > 0) & (df["area_m2"] > 0) & (df["trade_amount"] > 0)].copy()
    df["area_bin"] = pd.cut(
        df["area_m2"],
        bins=[0, 20, 40, 60, 85, 120, np.inf],
        labels=["a0_20", "a20_40", "a40_60", "a60_85", "a85_120", "a120p"],
        include_lowest=True,
    ).astype(str)
    df["floor_bin"] = pd.cut(
        df["floor"],
        bins=[-np.inf, 0, 1, 3, 6, np.inf],
        labels=["b_below", "b_1f", "b_2_3f", "b_4_6f", "b_7f_plus"],
        include_lowest=True,
    ).astype(str)
    return df


def build_monthly_panel(df: pd.DataFrame) -> pd.DataFrame:
    panel = (
        df.groupby(PANEL_GROUP_COLUMNS + ["yyyymm"], as_index=False)
        .agg(
            {
                "land_area_m2": "median",
                "floor": "median",
                "built_year": "median",
                "building_age": "median",
                "lat": "median",
                "lng": "median",
                "bus_boarding_500m": "median",
                "bus_alighting_500m": "median",
                "subway_boarding_500m": "median",
                "subway_alighting_500m": "median",
                "reb_income_yield": "median",
                "reb_capital_yield": "median",
                "reb_investment_yield": "median",
                "reb_regional_rent": "median",
                "reb_rent_index": "median",
                "reb_noi": "median",
                "reb_floor_utility": "median",
                "area_m2": "median",
                "observed_rent": "median",
            }
        )
        .rename(columns={"observed_rent": "rent_t"})
    )
    panel["year"] = (panel["yyyymm"] // 100).astype(int)
    panel["month"] = (panel["yyyymm"] % 100).astype(int)
    panel["quarter"] = panel["year"].astype(str) + "Q" + (((panel["month"] - 1) // 3) + 1).astype(str)
    return panel


def attach_horizon_targets(panel: pd.DataFrame) -> pd.DataFrame:
    out = panel.copy()
    for horizon, months_ahead in HORIZON_MONTHS.items():
        fut = panel[PANEL_GROUP_COLUMNS + ["yyyymm", "rent_t"]].copy()
        fut["yyyymm"] = fut["yyyymm"].map(lambda v: shift_yyyymm(int(v), -months_ahead))
        fut = fut.rename(columns={"rent_t": f"target_{horizon}"})
        out = out.merge(fut, on=PANEL_GROUP_COLUMNS + ["yyyymm"], how="left")
    # Stabilized 3-month target: median over 2~4 months ahead.
    t2 = panel[PANEL_GROUP_COLUMNS + ["yyyymm", "rent_t"]].copy()
    t3 = panel[PANEL_GROUP_COLUMNS + ["yyyymm", "rent_t"]].copy()
    t4 = panel[PANEL_GROUP_COLUMNS + ["yyyymm", "rent_t"]].copy()
    t2["yyyymm"] = t2["yyyymm"].map(lambda v: shift_yyyymm(int(v), -2))
    t3["yyyymm"] = t3["yyyymm"].map(lambda v: shift_yyyymm(int(v), -3))
    t4["yyyymm"] = t4["yyyymm"].map(lambda v: shift_yyyymm(int(v), -4))
    t2 = t2.rename(columns={"rent_t": "target_h3m_t2"})
    t3 = t3.rename(columns={"rent_t": "target_h3m_t3"})
    t4 = t4.rename(columns={"rent_t": "target_h3m_t4"})
    out = out.merge(t2, on=PANEL_GROUP_COLUMNS + ["yyyymm"], how="left")
    out = out.merge(t3, on=PANEL_GROUP_COLUMNS + ["yyyymm"], how="left")
    out = out.merge(t4, on=PANEL_GROUP_COLUMNS + ["yyyymm"], how="left")
    out["target_h3m"] = out[["target_h3m_t2", "target_h3m_t3", "target_h3m_t4"]].median(axis=1, skipna=True)
    out = out.drop(columns=["target_h3m_t2", "target_h3m_t3", "target_h3m_t4"])
    return out


def build_model_params(device: str) -> Dict[str, object]:
    params: Dict[str, object] = {
        "objective": "regression",
        "n_estimators": 1200,
        "learning_rate": 0.03,
        "num_leaves": 63,
        "subsample": 0.85,
        "colsample_bytree": 0.85,
        "random_state": 42,
    }
    if device == "gpu":
        params["device_type"] = "gpu"
    return params


def fit_lgbm_with_device(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    device: str,
    sample_weight: Optional[np.ndarray] = None,
) -> tuple[LGBMRegressor, str]:
    requested_device = "gpu" if device == "gpu" or (device == "auto" and Path("/content").exists()) else "cpu"
    model = LGBMRegressor(**build_model_params(requested_device))
    try:
        model.fit(X_train, y_train, categorical_feature=CATEGORICAL_COLUMNS, sample_weight=sample_weight)
        return model, requested_device
    except Exception:
        if device != "auto":
            raise
        print("LightGBM GPU training failed. Falling back to CPU.")
        model = LGBMRegressor(**build_model_params("cpu"))
        model.fit(X_train, y_train, categorical_feature=CATEGORICAL_COLUMNS, sample_weight=sample_weight)
        return model, "cpu"


def time_splits(
    df: pd.DataFrame,
    horizon_months: int,
    min_train_months: int = 12,
    n_folds: int = 4,
) -> List[tuple[np.ndarray, np.ndarray, int]]:
    unique_months = np.array(sorted(df["yyyymm"].dropna().astype(int).unique()))
    if len(unique_months) < (min_train_months + horizon_months + 1):
        return []

    candidate_indices = list(range(min_train_months - 1, len(unique_months) - horizon_months))
    selected = candidate_indices[-n_folds:]
    splits: List[tuple[np.ndarray, np.ndarray, int]] = []
    yyyymm_series = df["yyyymm"].astype(int)
    for idx in selected:
        cutoff = int(unique_months[idx])
        valid_month = int(unique_months[idx + horizon_months])
        train_mask = yyyymm_series <= cutoff
        valid_mask = yyyymm_series == valid_month
        if int(train_mask.sum()) == 0 or int(valid_mask.sum()) == 0:
            continue
        splits.append((train_mask.to_numpy(), valid_mask.to_numpy(), cutoff))
    return splits


def compute_metrics(y_true: pd.Series, pred: np.ndarray) -> Dict[str, float]:
    y = y_true.to_numpy(dtype=float)
    p = pred.astype(float)
    smape_denom = np.maximum((np.abs(y) + np.abs(p)) / 2.0, 1e-9)
    mape_denom = np.maximum(np.abs(y), 1e-9)
    return {
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(mean_squared_error(y, p) ** 0.5),
        "mape": float(np.mean(np.abs((y - p) / mape_denom)) * 100.0),
        "smape": float(np.mean(np.abs(y - p) / smape_denom) * 100.0),
        "r2": float(r2_score(y, p)),
    }


def winsorize_series(s: pd.Series, low_q: float = 0.01, high_q: float = 0.99) -> pd.Series:
    low = float(s.quantile(low_q))
    high = float(s.quantile(high_q))
    return s.clip(lower=low, upper=high)


def month_index(yyyymm: pd.Series) -> pd.Series:
    years = (yyyymm.astype(int) // 100).astype(int)
    months = (yyyymm.astype(int) % 100).astype(int)
    return years * 12 + months


def recency_weights(yyyymm: pd.Series, min_w: float = 0.6, max_w: float = 1.4) -> np.ndarray:
    idx = month_index(yyyymm).astype(float)
    min_idx = float(idx.min())
    max_idx = float(idx.max())
    if max_idx <= min_idx:
        return np.ones(len(idx), dtype=float)
    norm = (idx - min_idx) / (max_idx - min_idx)
    return (min_w + (max_w - min_w) * norm).to_numpy(dtype=float)


def summarize_segment_errors(y_true: pd.Series, pred: np.ndarray, by: pd.Series) -> List[Dict[str, object]]:
    temp = pd.DataFrame({"y": y_true.to_numpy(dtype=float), "p": pred.astype(float), "g": by.astype(str)})
    out: List[Dict[str, object]] = []
    for group, gdf in temp.groupby("g"):
        if len(gdf) < 30:
            continue
        mae = float(np.mean(np.abs(gdf["y"] - gdf["p"])))
        out.append({"group": group, "count": int(len(gdf)), "mae": mae})
    out.sort(key=lambda x: x["mae"], reverse=True)
    return out[:10]


def build_reb_trend_priors(panel: pd.DataFrame) -> tuple[Dict[str, Dict[str, float]], Dict[str, pd.DataFrame]]:
    reb_panel = (
        panel.groupby(["commercial_type", "yyyymm"], as_index=False)["reb_regional_rent"]
        .median()
        .rename(columns={"reb_regional_rent": "reb_t"})
    )
    priors: Dict[str, Dict[str, float]] = {}
    trend_tables: Dict[str, pd.DataFrame] = {}
    for horizon, months_ahead in HORIZON_MONTHS.items():
        fut = reb_panel[["commercial_type", "yyyymm", "reb_t"]].copy()
        fut["yyyymm"] = fut["yyyymm"].map(lambda v: shift_yyyymm(int(v), -months_ahead))
        fut = fut.rename(columns={"reb_t": "reb_future"})
        joined = reb_panel.merge(fut, on=["commercial_type", "yyyymm"], how="left")
        joined = joined[(joined["reb_t"] > 0) & (joined["reb_future"] > 0)].copy()
        joined["trend_ratio"] = joined["reb_future"] / joined["reb_t"]
        joined["trend_ratio"] = winsorize_series(joined["trend_ratio"], 0.01, 0.99)
        trend_tables[horizon] = joined[["commercial_type", "yyyymm", "trend_ratio"]].copy()

        by_type = joined.groupby("commercial_type")["trend_ratio"].median().to_dict()
        by_type = {str(k): float(v) for k, v in by_type.items()}
        by_type["__global__"] = float(joined["trend_ratio"].median()) if not joined.empty else 1.0
        priors[horizon] = by_type
    return priors, trend_tables


def resolve_data_dir(data_dir: Optional[str]) -> Path:
    if data_dir:
        return Path(data_dir).expanduser()
    if (Path("/content") / "drive").exists():
        return DEFAULT_COLAB_DATA_DIR
    return DEFAULT_DATA_DIR


def mount_google_drive() -> None:
    try:
        from google.colab import drive  # type: ignore
    except ImportError as exc:
        raise RuntimeError("--mount-drive can only be used inside Google Colab") from exc
    drive.mount("/content/drive")


def zip_training_outputs(output_dir: Path) -> Path:
    zip_path = output_dir / "commercial_rent_ai_outputs.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for folder_name in ["models", "config"]:
            folder = output_dir / folder_name
            if not folder.exists():
                continue
            for path in folder.rglob("*"):
                if path.is_file():
                    archive.write(path, path.relative_to(output_dir))
    return zip_path


def train_models(df: pd.DataFrame, output_dir: Path, device: str):
    model_dir = output_dir / "models"
    config_dir = output_dir / "config"
    model_dir.mkdir(parents=True, exist_ok=True)
    config_dir.mkdir(parents=True, exist_ok=True)

    (config_dir / "feature_columns.json").write_text(
        json.dumps(FEATURE_COLUMNS, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (config_dir / "categorical_columns.json").write_text(
        json.dumps(CATEGORICAL_COLUMNS, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    panel = attach_horizon_targets(build_monthly_panel(df))
    panel = panel[(panel["rent_t"] > 0)].copy()
    trend_priors, trend_tables = build_reb_trend_priors(panel)
    metrics: Dict[str, Dict[str, float]] = {}
    backtest: Dict[str, Dict[str, object]] = {}
    used_devices = {}

    base_df = panel.dropna(subset=["rent_t"]).copy()
    base_df["rent_t"] = winsorize_series(base_df["rent_t"])
    X_base_all = base_df[FEATURE_COLUMNS].copy()
    for col in CATEGORICAL_COLUMNS:
        X_base_all[col] = X_base_all[col].astype("category")
    base_weights = recency_weights(base_df["yyyymm"])
    base_model, base_device = fit_lgbm_with_device(
        X_base_all,
        np.log1p(base_df["rent_t"]),
        device,
        sample_weight=base_weights,
    )
    used_devices["base"] = base_device
    joblib.dump(base_model, model_dir / "rent_base.pkl")
    for horizon, months_ahead in HORIZON_MONTHS.items():
        target_col = f"target_{horizon}"
        horizon_df = panel.dropna(subset=[target_col, "rent_t"]).copy()
        horizon_df = horizon_df[(horizon_df[target_col] > 0) & (horizon_df["rent_t"] > 0)].copy()
        horizon_df = horizon_df.merge(trend_tables[horizon], on=["commercial_type", "yyyymm"], how="left")
        default_prior = trend_priors.get(horizon, {}).get("__global__", 1.0)
        if horizon == "h3m":
            horizon_df["trend_ratio"] = horizon_df["trend_ratio"].fillna(default_prior).clip(lower=0.7, upper=1.4)
        else:
            horizon_df["trend_ratio"] = horizon_df["trend_ratio"].fillna(default_prior).clip(lower=0.5, upper=1.8)
        horizon_df[target_col] = winsorize_series(horizon_df[target_col])
        if horizon_df.empty:
            raise RuntimeError(f"No training rows for {horizon}. Check source data coverage.")

        fold_metrics: List[Dict[str, float]] = []
        splits = time_splits(horizon_df, months_ahead)
        for train_mask, valid_mask, _ in splits:
            train_fold = horizon_df.iloc[np.where(train_mask)[0]]
            valid_fold = horizon_df.iloc[np.where(valid_mask)[0]]
            X_train = train_fold[FEATURE_COLUMNS].copy()
            X_valid = valid_fold[FEATURE_COLUMNS].copy()
            for col in CATEGORICAL_COLUMNS:
                X_train[col] = X_train[col].astype("category")
                X_valid[col] = X_valid[col].astype("category")
            y_train_ratio_log = np.log(train_fold[target_col] / train_fold["rent_t"]) - np.log(train_fold["trend_ratio"])
            fold_weights = recency_weights(train_fold["yyyymm"])
            if horizon == "h3m":
                fold_weights = fold_weights * 1.2
            model, _ = fit_lgbm_with_device(X_train, y_train_ratio_log, device, sample_weight=fold_weights)
            pred_residual = np.exp(model.predict(X_valid))
            pred = (
                valid_fold["rent_t"].to_numpy(dtype=float)
                * valid_fold["trend_ratio"].to_numpy(dtype=float)
                * pred_residual
            )
            fold_metrics.append(compute_metrics(valid_fold[target_col], pred))

        X_all = horizon_df[FEATURE_COLUMNS].copy()
        for col in CATEGORICAL_COLUMNS:
            X_all[col] = X_all[col].astype("category")
        y_all_ratio_log = np.log(horizon_df[target_col] / horizon_df["rent_t"]) - np.log(horizon_df["trend_ratio"])
        all_weights = recency_weights(horizon_df["yyyymm"])
        if horizon == "h3m":
            all_weights = all_weights * 1.2
        final_model, used_device = fit_lgbm_with_device(X_all, y_all_ratio_log, device, sample_weight=all_weights)
        used_devices[horizon] = used_device
        joblib.dump(final_model, model_dir / f"rent_{horizon}.pkl")

        if fold_metrics:
            keys = list(fold_metrics[0].keys())
            mean_metrics = {k: float(np.mean([m[k] for m in fold_metrics])) for k in keys}
            std_metrics = {k: float(np.std([m[k] for m in fold_metrics])) for k in keys}
        else:
            mean_metrics = {"mae": np.nan, "rmse": np.nan, "mape": np.nan, "smape": np.nan, "r2": np.nan}
            std_metrics = {"mae": np.nan, "rmse": np.nan, "mape": np.nan, "smape": np.nan, "r2": np.nan}

        metrics[horizon] = mean_metrics
        backtest[horizon] = {
            "horizon_months": months_ahead,
            "sample_count": int(len(horizon_df)),
            "fold_count": len(fold_metrics),
            "cv_mean": mean_metrics,
            "cv_std": std_metrics,
        }

        if splits:
            last_train_mask, last_valid_mask, _ = splits[-1]
            train_fold = horizon_df.iloc[np.where(last_train_mask)[0]]
            valid_fold = horizon_df.iloc[np.where(last_valid_mask)[0]]
            X_train_last = train_fold[FEATURE_COLUMNS].copy()
            X_valid_last = valid_fold[FEATURE_COLUMNS].copy()
            for col in CATEGORICAL_COLUMNS:
                X_train_last[col] = X_train_last[col].astype("category")
                X_valid_last[col] = X_valid_last[col].astype("category")
            last_model, _ = fit_lgbm_with_device(
                X_train_last,
                np.log(train_fold[target_col] / train_fold["rent_t"]) - np.log(train_fold["trend_ratio"]),
                device,
                sample_weight=recency_weights(train_fold["yyyymm"]),
            )
            last_pred = (
                valid_fold["rent_t"].to_numpy(dtype=float)
                * valid_fold["trend_ratio"].to_numpy(dtype=float)
                * np.exp(last_model.predict(X_valid_last))
            )
            backtest[horizon]["top_segment_errors_sigungu"] = summarize_segment_errors(
                valid_fold[target_col],
                last_pred,
                valid_fold["sigungu"],
            )

    meta = {
        "model_version": "commercial-rent-v1",
        "reference_quarter": sorted(panel["quarter"].dropna().unique())[-1],
        "target": "monthly_rent_manwon",
        "target_formula": "predicted_rent(t+h) = predicted_base_rent(t) * reb_trend_prior(h) * exp(predicted_log_residual_h), observed_rent = trade_amount_manwon * (reb_income_yield_percent / 100) / 12",
        "training_structure": "base_plus_reb_trend_prior_plus_residual",
        "unit": "만원/월",
        "confidence": "medium",
        "rows": int(len(panel)),
        "horizon_months": HORIZON_MONTHS,
        "trend_prior_ratio_by_horizon": trend_priors,
        "backtest": backtest,
        "training_device": used_devices,
        "metrics": metrics,
    }
    (config_dir / "model_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return metrics


def main():
    parser = argparse.ArgumentParser(description="Train CommercialRentAI models locally or on Google Colab.")
    parser.add_argument(
        "--data-dir",
        default=None,
        help=(
            "Training data folder. In Colab, defaults to "
            "'/content/drive/MyDrive/집현전/상가 임대료AI' when Google Drive is mounted."
        ),
    )
    parser.add_argument(
        "--output-dir",
        default=str(BASE_DIR),
        help="Folder where models/ and config/ will be written. Use /content/CommercialRentAI on Colab.",
    )
    parser.add_argument(
        "--device",
        choices=["auto", "cpu", "gpu"],
        default="auto",
        help="LightGBM training device. 'auto' tries GPU first on Colab and falls back to CPU.",
    )
    parser.add_argument(
        "--mount-drive",
        action="store_true",
        help="Mount Google Drive before reading data. Colab only.",
    )
    parser.add_argument(
        "--zip-output",
        action="store_true",
        help="Create commercial_rent_ai_outputs.zip containing models/ and config/.",
    )
    args = parser.parse_args()

    if args.mount_drive:
        mount_google_drive()

    data_dir = resolve_data_dir(args.data_dir)
    output_dir = Path(args.output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not data_dir.exists():
        raise FileNotFoundError(f"Training data folder does not exist: {data_dir}")

    print(f"data_dir: {data_dir}")
    print(f"output_dir: {output_dir}")
    print(f"requested_device: {args.device}")

    df = prepare_training_frame(data_dir)
    print(f"training rows: {len(df)}")
    metrics = train_models(df, output_dir, args.device)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))

    if args.zip_output:
        zip_path = zip_training_outputs(output_dir)
        print(f"zipped outputs: {zip_path}")


if __name__ == "__main__":
    main()
