import os
from contextlib import asynccontextmanager
from typing import Literal, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from services.commercial_predictor import CommercialPredictorService


class CommercialRentPredictionRequest(BaseModel):
    address: Optional[str] = Field(
        default=None,
        description="Original address text. Not used directly by the model.",
    )
    sigungu: str
    commercialType: str = Field(default="unknown")
    buildingUse: str = Field(default="unknown")
    zoning: str = Field(default="unknown")
    roadCondition: str = Field(default="unknown")
    areaM2: float
    landAreaM2: Optional[float] = 0.0
    floor: Optional[float] = 1.0
    builtYear: Optional[float] = 0.0
    lat: Optional[float] = 0.0
    lng: Optional[float] = 0.0
    busBoarding500m: Optional[float] = 0.0
    busAlighting500m: Optional[float] = 0.0
    subwayBoarding500m: Optional[float] = 0.0
    subwayAlighting500m: Optional[float] = 0.0
    rebIncomeYield: Optional[float] = 0.0
    rebCapitalYield: Optional[float] = 0.0
    rebInvestmentYield: Optional[float] = 0.0
    rebRegionalRent: Optional[float] = 0.0
    rebRentIndex: Optional[float] = 0.0
    rebNoi: Optional[float] = 0.0
    rebFloorUtility: Optional[float] = 100.0
    asOfYearMonth: Optional[str] = Field(default=None, description="YYYYMM")
    targetMonth: Literal["h1m", "h6m"] = Field(default="h1m", description="h1m, h6m")


class CommercialRentPredictionResponse(BaseModel):
    predictedMonthlyRent: float
    unit: str
    referenceQuarter: str
    modelVersion: str
    confidence: str
    predictionRange: dict
    address: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    app.state.predictor_service = CommercialPredictorService(base_dir=base_dir)
    yield


app = FastAPI(
    title="ZIPHYEONJEON Commercial Rent AI",
    description="LightGBM commercial rent prediction service",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=[
        {"name": "health", "description": "Service health check"},
        {"name": "prediction", "description": "Commercial rent prediction APIs"},
    ],
)


@app.get("/health", tags=["health"], summary="Health Check")
def health():
    return {"status": "up", "service": "CommercialRentAI"}


def _predict_core(req_data: CommercialRentPredictionRequest) -> CommercialRentPredictionResponse:
    try:
        result = app.state.predictor_service.predict(req_data.model_dump())
        if req_data.address:
            result["address"] = req_data.address
        return CommercialRentPredictionResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Commercial prediction failed: {str(e)}")


@app.post(
    "/predict/commercial-rent",
    tags=["prediction"],
    summary="Predict Commercial Rent (Legacy Path)",
    response_model=CommercialRentPredictionResponse,
)
def predict_commercial_rent(req_data: CommercialRentPredictionRequest):
    return _predict_core(req_data)


@app.post(
    "/api/stores/predict",
    tags=["prediction"],
    summary="Predict Store Rent",
    description="Predict monthly rent from location and commercial features.",
    response_model=CommercialRentPredictionResponse,
)
def predict_store_rent(req_data: CommercialRentPredictionRequest):
    return _predict_core(req_data)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8010))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
