import json
import os
from datetime import datetime
from typing import Any, Dict, List

import joblib
import numpy as np
import pandas as pd


class CommercialPredictorService:
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.model_dir = os.path.join(base_dir, "models")
        self.config_dir = os.path.join(base_dir, "config")
        self.models: Dict[str, Any] = {}
        self.feature_cols: List[str] = []
        self.cat_cols: List[str] = []
        self.meta: Dict[str, Any] = {}
        self.base_model: Any = None
        self._load_configs_and_models()

    @staticmethod
    def _area_bin(area: float) -> str:
        if area <= 20:
            return "a0_20"
        if area <= 40:
            return "a20_40"
        if area <= 60:
            return "a40_60"
        if area <= 85:
            return "a60_85"
        if area <= 120:
            return "a85_120"
        return "a120p"

    @staticmethod
    def _floor_bin(floor: float) -> str:
        if floor <= 0:
            return "b_below"
        if floor <= 1:
            return "b_1f"
        if floor <= 3:
            return "b_2_3f"
        if floor <= 6:
            return "b_4_6f"
        return "b_7f_plus"

    def _load_json(self, filename: str, default: Any):
        path = os.path.join(self.config_dir, filename)
        if not os.path.exists(path):
            return default
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _load_configs_and_models(self):
        self.feature_cols = self._load_json("feature_columns.json", [])
        self.cat_cols = self._load_json("categorical_columns.json", [])
        self.meta = self._load_json("model_meta.json", {})

        if os.path.exists(self.model_dir):
            for model_file in os.listdir(self.model_dir):
                if model_file.endswith(".pkl"):
                    if model_file == "rent_base.pkl":
                        self.base_model = joblib.load(os.path.join(self.model_dir, model_file))
                        continue
                    horizon = model_file.replace("rent_", "").replace(".pkl", "")
                    self.models[horizon] = joblib.load(os.path.join(self.model_dir, model_file))

        print(f"Loaded commercial rent models: {list(self.models.keys())}, base: {self.base_model is not None}")

    @staticmethod
    def _resolve_asof(payload: Dict[str, Any]) -> tuple[int, int]:
        asof = str(payload.get("asOfYearMonth", "")).strip()
        if asof and len(asof) == 6 and asof.isdigit():
            return int(asof[:4]), int(asof[4:6])
        now = datetime.now()
        return now.year, now.month

    @staticmethod
    def _target_to_horizon(target_month: str) -> str:
        if not target_month:
            return "h1m"
        horizon = target_month if target_month.startswith("h") else f"h{target_month}"
        if horizon not in {"h1m", "h6m"}:
            raise ValueError("targetMonth must be one of: h1m, h6m")
        return horizon

    @staticmethod
    def _latest_quarter() -> str:
        now = datetime.now()
        return f"{now.year}Q{((now.month - 1) // 3) + 1}"

    @staticmethod
    def _number(value: Any, default: float = 0.0) -> float:
        if value is None or value == "":
            return default
        try:
            return float(str(value).replace(",", "").strip())
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _string(value: Any, default: str = "unknown") -> str:
        if value is None:
            return default
        text = str(value).strip()
        return text if text else default

    @staticmethod
    def _normalize_commercial_type(value: Any) -> str:
        text = str(value or "").strip().replace(" ", "")
        if not text:
            return "unknown"
        if "오피스" in text or "업무" in text:
            return "오피스"
        if "집합" in text:
            return "집합 상가"
        if "중대형" in text or "일반" in text:
            return "중대형 상가"
        if "소규모" in text:
            return "소규모 상가"
        return str(value).strip() or "unknown"

    def _build_feature_row(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        area = self._number(payload.get("areaM2"), 0.0)
        floor = self._number(payload.get("floor"), 1.0)
        built_year = self._number(payload.get("builtYear"), 0.0)
        asof_year, asof_month = self._resolve_asof(payload)
        building_age = max(0.0, asof_year - built_year) if built_year > 0 else np.nan

        return {
            "sigungu": self._string(payload.get("sigungu")),
            "commercial_type": self._normalize_commercial_type(payload.get("commercialType")),
            "building_use": self._string(payload.get("buildingUse")),
            "zoning": self._string(payload.get("zoning")),
            "road_condition": self._string(payload.get("roadCondition")),
            "area_m2": area,
            "area_bin": self._area_bin(area),
            "land_area_m2": self._number(payload.get("landAreaM2"), 0.0),
            "floor": floor,
            "floor_bin": self._floor_bin(floor),
            "built_year": built_year,
            "building_age": building_age,
            "lat": self._number(payload.get("lat"), np.nan),
            "lng": self._number(payload.get("lng"), np.nan),
            "bus_boarding_500m": self._number(payload.get("busBoarding500m"), np.nan),
            "bus_alighting_500m": self._number(payload.get("busAlighting500m"), np.nan),
            "subway_boarding_500m": self._number(payload.get("subwayBoarding500m"), np.nan),
            "subway_alighting_500m": self._number(payload.get("subwayAlighting500m"), np.nan),
            "year": asof_year,
            "month": asof_month,
            "quarter": f"{asof_year}Q{((asof_month - 1) // 3) + 1}",
            "reb_income_yield": self._number(payload.get("rebIncomeYield"), np.nan),
            "reb_capital_yield": self._number(payload.get("rebCapitalYield"), np.nan),
            "reb_investment_yield": self._number(payload.get("rebInvestmentYield"), np.nan),
            "reb_regional_rent": self._number(payload.get("rebRegionalRent"), np.nan),
            "reb_rent_index": self._number(payload.get("rebRentIndex"), np.nan),
            "reb_noi": self._number(payload.get("rebNoi"), np.nan),
            "reb_floor_utility": self._number(payload.get("rebFloorUtility"), np.nan),
        }

    def _trend_prior(self, horizon: str, commercial_type: str) -> float:
        priors = self.meta.get("trend_prior_ratio_by_horizon", {})
        hz_priors = priors.get(horizon, {}) if isinstance(priors, dict) else {}
        if not isinstance(hz_priors, dict):
            return 1.0
        value = hz_priors.get(commercial_type, hz_priors.get("__global__", 1.0))
        try:
            return float(value)
        except (TypeError, ValueError):
            return 1.0

    def _residual_log_bounds(self, horizon: str) -> tuple[float, float]:
        raw = self.meta.get("residual_log_bounds_by_horizon", {})
        if not isinstance(raw, dict):
            return (-0.7, 0.7)
        hz = raw.get(horizon, {})
        if not isinstance(hz, dict):
            return (-0.7, 0.7)
        try:
            low = float(hz.get("low", -0.7))
            high = float(hz.get("high", 0.7))
            if low >= high:
                return (-0.7, 0.7)
            return (low, high)
        except (TypeError, ValueError):
            return (-0.7, 0.7)

    def _target_ratio_bounds(self, horizon: str) -> tuple[float, float]:
        raw = self.meta.get("target_ratio_bounds_by_horizon", {})
        if not isinstance(raw, dict):
            return (0.6, 1.8)
        hz = raw.get(horizon, {})
        if not isinstance(hz, dict):
            return (0.6, 1.8)
        try:
            low = float(hz.get("low", 0.6))
            high = float(hz.get("high", 1.8))
            if low >= high:
                return (0.6, 1.8)
            return (low, high)
        except (TypeError, ValueError):
            return (0.6, 1.8)

    @staticmethod
    def _clip(v: float, low: float, high: float) -> float:
        return float(max(low, min(high, v)))

    @staticmethod
    def _is_missing(value: Any) -> bool:
        if value is None:
            return True
        if isinstance(value, float) and np.isnan(value):
            return True
        return False

    def _get_inference_profile(self, sigungu: str, commercial_type: str) -> Dict[str, float]:
        profiles = self.meta.get("inference_feature_profiles", {})
        if not isinstance(profiles, dict):
            return {}

        by_sigungu_type = profiles.get("by_sigungu_commercial_type", {})
        by_type = profiles.get("by_commercial_type", {})
        global_profile = profiles.get("global", {})

        if isinstance(by_sigungu_type, dict):
            sigungu_profiles = by_sigungu_type.get(sigungu, {})
            if isinstance(sigungu_profiles, dict):
                profile = sigungu_profiles.get(commercial_type)
                if isinstance(profile, dict):
                    return profile
        if isinstance(by_type, dict):
            profile = by_type.get(commercial_type)
            if isinstance(profile, dict):
                return profile
        if isinstance(global_profile, dict):
            return global_profile
        return {}

    def _fill_missing_features(self, row: Dict[str, Any]) -> Dict[str, Any]:
        sigungu = str(row.get("sigungu", "unknown"))
        commercial_type = str(row.get("commercial_type", "unknown"))
        profile = self._get_inference_profile(sigungu, commercial_type)
        if not profile:
            return row

        for key in [
            "lat",
            "lng",
            "bus_boarding_500m",
            "bus_alighting_500m",
            "subway_boarding_500m",
            "subway_alighting_500m",
            "reb_income_yield",
            "reb_capital_yield",
            "reb_investment_yield",
            "reb_regional_rent",
            "reb_rent_index",
            "reb_noi",
            "reb_floor_utility",
        ]:
            if self._is_missing(row.get(key)):
                val = profile.get(key)
                if not self._is_missing(val):
                    row[key] = float(val)
        return row

    def _apply_prediction_guardrails(self, predictions: Dict[str, float], base_rent: float) -> Dict[str, float]:
        if base_rent > 0:
            for hz in list(predictions.keys()):
                low_ratio, high_ratio = self._target_ratio_bounds(hz)
                low = base_rent * low_ratio
                high = base_rent * high_ratio
                predictions[hz] = self._clip(predictions[hz], low, high)

        if "h1m" in predictions and "h6m" in predictions:
            h1 = max(predictions["h1m"], 0.0)
            h6_low = h1 * 0.7
            h6_high = h1 * 1.7
            predictions["h6m"] = self._clip(predictions["h6m"], h6_low, h6_high)

        if all(hz in predictions for hz in ["h1m", "h3m", "h6m"]):
            predictions["h3m"] = self._clip(predictions["h3m"], predictions["h1m"], predictions["h6m"])
        return predictions

    def _apply_market_floor(self, predictions: Dict[str, float], df: pd.DataFrame) -> Dict[str, float]:
        area = float(df.iloc[0].get("area_m2", np.nan))
        reb_regional_rent = float(df.iloc[0].get("reb_regional_rent", np.nan))
        if not np.isfinite(area) or not np.isfinite(reb_regional_rent) or area <= 0 or reb_regional_rent <= 0:
            return predictions

        # reb_regional_rent unit is roughly 천원/㎡. Convert to 만원/월 and use a conservative floor ratio.
        market_anchor = (reb_regional_rent * area) / 10.0
        floor_value = market_anchor * 0.45
        for hz in list(predictions.keys()):
            predictions[hz] = max(predictions[hz], floor_value)
        return predictions

    def _segment_calibration_ratio(self, horizon: str, sigungu: str, commercial_type: str, area_bin: str) -> float:
        raw = self.meta.get("segment_calibration_by_horizon", {})
        if not isinstance(raw, dict):
            return 1.0
        hz = raw.get(horizon, {})
        if not isinstance(hz, dict):
            return 1.0
        by_segment = hz.get("by_segment", {})
        by_type = hz.get("by_type", {})
        global_v = hz.get("global", 1.0)
        try:
            if isinstance(by_segment, dict):
                seg1 = by_segment.get(sigungu, {})
                if isinstance(seg1, dict):
                    seg2 = seg1.get(commercial_type, {})
                    if isinstance(seg2, dict) and area_bin in seg2:
                        return float(seg2[area_bin])
            if isinstance(by_type, dict) and commercial_type in by_type:
                return float(by_type[commercial_type])
            return float(global_v)
        except (TypeError, ValueError):
            return 1.0

    def _segment_band(self, horizon: str, sigungu: str, commercial_type: str, area_bin: str) -> tuple[float, float] | None:
        raw = self.meta.get("segment_bands_by_horizon", {})
        if not isinstance(raw, dict):
            return None
        hz = raw.get(horizon, {})
        if not isinstance(hz, dict):
            return None
        by_segment = hz.get("by_segment", {})
        by_type = hz.get("by_type", {})
        global_band = hz.get("global", {})
        try:
            if isinstance(by_segment, dict):
                seg1 = by_segment.get(sigungu, {})
                if isinstance(seg1, dict):
                    seg2 = seg1.get(commercial_type, {})
                    if isinstance(seg2, dict):
                        seg3 = seg2.get(area_bin, {})
                        if isinstance(seg3, dict):
                            p10 = float(seg3.get("p10"))
                            p90 = float(seg3.get("p90"))
                            if p10 < p90:
                                return (p10, p90)
            if isinstance(by_type, dict):
                seg = by_type.get(commercial_type, {})
                if isinstance(seg, dict):
                    p10 = float(seg.get("p10"))
                    p90 = float(seg.get("p90"))
                    if p10 < p90:
                        return (p10, p90)
            if isinstance(global_band, dict):
                p10 = float(global_band.get("p10"))
                p90 = float(global_band.get("p90"))
                if p10 < p90:
                    return (p10, p90)
        except (TypeError, ValueError):
            return None
        return None

    def predict(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        horizon = self._target_to_horizon(payload.get("targetMonth", "h1m"))
        if horizon not in self.models:
            raise FileNotFoundError(
                f"Commercial model '{horizon}' not found. Available: {list(self.models.keys())}"
            )
        if not self.feature_cols:
            raise ValueError("config/feature_columns.json is missing or empty")

        feature_row = self._build_feature_row(payload)
        feature_row = self._fill_missing_features(feature_row)
        df = pd.DataFrame([feature_row])
        for col in self.feature_cols:
            if col not in df.columns:
                df[col] = np.nan
        df = df[self.feature_cols].copy()

        for col in self.cat_cols:
            if col in df.columns:
                df[col] = df[col].astype("category")

        predictions: Dict[str, float] = {}
        if self.base_model is not None:
            base_log = self.base_model.predict(df)
            base_rent = max(0.0, float(np.expm1(base_log[0])))
            commercial_type = str(df.iloc[0].get("commercial_type", "unknown"))
            sigungu = str(df.iloc[0].get("sigungu", "unknown"))
            area_bin = str(df.iloc[0].get("area_bin", "unknown"))
            for hz, model in self.models.items():
                residual_log = float(model.predict(df)[0])
                low, high = self._residual_log_bounds(hz)
                residual_log = self._clip(residual_log, low, high)
                trend_prior = self._trend_prior(hz, commercial_type)
                raw_pred = max(0.0, float(base_rent * trend_prior * np.exp(residual_log)))
                ratio = self._segment_calibration_ratio(hz, sigungu, commercial_type, area_bin)
                raw_pred = max(0.0, raw_pred * ratio)
                band = self._segment_band(hz, sigungu, commercial_type, area_bin)
                if band is not None:
                    raw_pred = self._clip(raw_pred, band[0], band[1])
                predictions[hz] = raw_pred
            predictions = self._apply_prediction_guardrails(predictions, base_rent)
            predictions = self._apply_market_floor(predictions, df)
        else:
            for hz, model in self.models.items():
                pred_log = model.predict(df)
                predictions[hz] = max(0.0, float(np.expm1(pred_log[0])))

        h3m_r2 = None
        try:
            h3m_r2 = float(self.meta.get("metrics", {}).get("h3m", {}).get("r2"))
        except (TypeError, ValueError):
            h3m_r2 = None
        if h3m_r2 is not None and h3m_r2 < 0 and all(hz in predictions for hz in ["h1m", "h6m"]):
            predictions["h3m"] = float(np.sqrt(max(predictions["h1m"], 0.0) * max(predictions["h6m"], 0.0)))

        predicted = predictions[horizon]

        return {
            "predictedMonthlyRent": round(predicted, 2),
            "unit": "만원/월",
            "referenceQuarter": self.meta.get("reference_quarter", self._latest_quarter()),
            "modelVersion": self.meta.get("model_version", "commercial-rent-v1"),
            "confidence": self.meta.get("confidence", "medium"),
            "predictionRange": {
                "lower": round(predicted * 0.85, 2),
                "upper": round(predicted * 1.15, 2),
            },
        }
