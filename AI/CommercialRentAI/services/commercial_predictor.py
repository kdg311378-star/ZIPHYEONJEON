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

    def _build_feature_row(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        area = self._number(payload.get("areaM2"), 0.0)
        floor = self._number(payload.get("floor"), 1.0)
        built_year = self._number(payload.get("builtYear"), 0.0)
        asof_year, asof_month = self._resolve_asof(payload)
        building_age = max(0.0, asof_year - built_year) if built_year > 0 else np.nan

        return {
            "sigungu": self._string(payload.get("sigungu")),
            "commercial_type": self._string(payload.get("commercialType")),
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
            "lat": self._number(payload.get("lat"), 0.0),
            "lng": self._number(payload.get("lng"), 0.0),
            "bus_boarding_500m": self._number(payload.get("busBoarding500m"), 0.0),
            "bus_alighting_500m": self._number(payload.get("busAlighting500m"), 0.0),
            "subway_boarding_500m": self._number(payload.get("subwayBoarding500m"), 0.0),
            "subway_alighting_500m": self._number(payload.get("subwayAlighting500m"), 0.0),
            "year": asof_year,
            "month": asof_month,
            "quarter": f"{asof_year}Q{((asof_month - 1) // 3) + 1}",
            "reb_income_yield": self._number(payload.get("rebIncomeYield"), 0.0),
            "reb_capital_yield": self._number(payload.get("rebCapitalYield"), 0.0),
            "reb_investment_yield": self._number(payload.get("rebInvestmentYield"), 0.0),
            "reb_regional_rent": self._number(payload.get("rebRegionalRent"), 0.0),
            "reb_rent_index": self._number(payload.get("rebRentIndex"), 0.0),
            "reb_noi": self._number(payload.get("rebNoi"), 0.0),
            "reb_floor_utility": self._number(payload.get("rebFloorUtility"), 100.0),
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

    def predict(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        horizon = self._target_to_horizon(payload.get("targetMonth", "h1m"))
        if horizon not in self.models:
            raise FileNotFoundError(
                f"Commercial model '{horizon}' not found. Available: {list(self.models.keys())}"
            )
        if not self.feature_cols:
            raise ValueError("config/feature_columns.json is missing or empty")

        df = pd.DataFrame([self._build_feature_row(payload)])
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
            for hz, model in self.models.items():
                residual_log = model.predict(df)
                trend_prior = self._trend_prior(hz, commercial_type)
                predictions[hz] = max(0.0, float(base_rent * trend_prior * np.exp(residual_log[0])))
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
