package io.pjj.ziphyeonjeon.store.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
@Schema(description = "상가 임대료 예측 요청 DTO")
public class StoreRentPredictRequestDto {
    @Schema(description = "원본 주소 문자열", example = "서울특별시 종로구 종로1가 1")
    private String address;

    @Schema(description = "시군구", example = "종로구")
    private String sigungu;

    @Schema(description = "상가 유형", example = "중대형 상가")
    private String commercialType = "unknown";

    @Schema(description = "건물 용도", example = "근린생활시설")
    private String buildingUse = "unknown";

    @Schema(description = "용도 지역", example = "상업지역")
    private String zoning = "unknown";

    @Schema(description = "도로 조건", example = "8m미만")
    private String roadCondition = "unknown";

    @Schema(description = "전용면적(m2)", example = "55.0")
    private Double areaM2;

    @Schema(description = "대지면적(m2)", example = "120.0")
    private Double landAreaM2 = 0.0;

    @Schema(description = "층수", example = "1")
    private Double floor = 1.0;

    @Schema(description = "준공연도", example = "2018")
    private Double builtYear = 0.0;

    @Schema(description = "위도", example = "37.57")
    private Double lat = 0.0;

    @Schema(description = "경도", example = "126.98")
    private Double lng = 0.0;

    @Schema(description = "500m 버스 승차량", example = "12000")
    private Double busBoarding500m = 0.0;

    @Schema(description = "500m 버스 하차량", example = "11800")
    private Double busAlighting500m = 0.0;

    @Schema(description = "500m 지하철 승차량", example = "9000")
    private Double subwayBoarding500m = 0.0;

    @Schema(description = "500m 지하철 하차량", example = "8800")
    private Double subwayAlighting500m = 0.0;

    @Schema(description = "REB 소득수익률(%)", example = "4.2")
    private Double rebIncomeYield = 0.0;

    @Schema(description = "REB 자본수익률(%)", example = "0.7")
    private Double rebCapitalYield = 0.0;

    @Schema(description = "REB 투자수익률(%)", example = "4.9")
    private Double rebInvestmentYield = 0.0;

    @Schema(description = "REB 지역 임대료", example = "65.0")
    private Double rebRegionalRent = 0.0;

    @Schema(description = "REB 임대료 지수", example = "102.3")
    private Double rebRentIndex = 0.0;

    @Schema(description = "REB NOI", example = "2100")
    private Double rebNoi = 0.0;

    @Schema(description = "REB 층별 효용", example = "96.0")
    private Double rebFloorUtility = 100.0;

    @Schema(description = "기준연월(YYYYMM)", example = "202605")
    private String asOfYearMonth;

    @Pattern(regexp = "^(h1m|h6m)$", message = "targetMonth must be h1m or h6m")
    @Schema(description = "예측 시점 (h1m/h6m)", example = "h1m")
    private String targetMonth = "h1m";
}
