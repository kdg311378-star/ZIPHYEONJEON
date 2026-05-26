package io.pjj.ziphyeonjeon.store.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "상가 임대료 예측 응답 DTO")
public class StoreRentPredictResponseDto {
    @Schema(description = "예측 월 임대료", example = "158.72")
    private Double predictedMonthlyRent;

    @Schema(description = "단위", example = "만원/월")
    private String unit;

    @Schema(description = "참조 분기", example = "2026Q1")
    private String referenceQuarter;

    @Schema(description = "모델 버전", example = "commercial-rent-v1")
    private String modelVersion;

    @Schema(description = "신뢰도", example = "medium")
    private String confidence;

    private PredictionRange predictionRange;

    @Schema(description = "요청 주소", example = "서울특별시 종로구 종로1가 1")
    private String address;

    @Data
    public static class PredictionRange {
        @Schema(description = "하한", example = "134.91")
        private Double lower;
        @Schema(description = "상한", example = "182.53")
        private Double upper;
    }
}

