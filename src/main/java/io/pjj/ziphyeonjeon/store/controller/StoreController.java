package io.pjj.ziphyeonjeon.store.controller;

import io.pjj.ziphyeonjeon.store.dto.StoreDto;
import io.pjj.ziphyeonjeon.store.dto.StoreRentPredictRequestDto;
import io.pjj.ziphyeonjeon.store.dto.StoreRentPredictResponseDto;
import io.pjj.ziphyeonjeon.store.service.StoreRentPredictService;
import io.pjj.ziphyeonjeon.store.service.StoreService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/stores")
public class StoreController {

    private final StoreService storeService;
    private final StoreRentPredictService storeRentPredictService;

    public StoreController(StoreService storeService, StoreRentPredictService storeRentPredictService) {
        this.storeService = storeService;
        this.storeRentPredictService = storeRentPredictService;
    }

    @Operation(summary = "상가 조회", description = "해당 시군구의 상가 실거래가를 조회합니다.")
    @GetMapping
    public ResponseEntity<List<StoreDto>> getStoresBySigungu(
            @Parameter(description = "법정동코드 또는 시군구명을 포함한 주소", schema = @Schema(example = "11110"))
            @RequestParam String sigungu,
            @Parameter(description = "거래연월(YYYYMM)", schema = @Schema(example = "202507"))
            @RequestParam(required = false) String dealYm) {
        List<StoreDto> stores = storeService.getStoresBySigungu(sigungu, dealYm);
        return ResponseEntity.ok(stores);
    }

    @Operation(summary = "상가 단건 상세 조회", description = "상가 ID를 통해 특정 상가 상세 정보를 조회합니다.")
    @GetMapping("/{storeId}")
    public ResponseEntity<StoreDto> getStoreById(
            @Parameter(description = "상가 ID", schema = @Schema(example = "1"))
            @PathVariable Long storeId,
            @Parameter(description = "법정동코드 또는 시군구명을 포함한 주소", schema = @Schema(example = "11110"))
            @RequestParam String sigungu) {
        StoreDto store = storeService.getStoreById(storeId, sigungu);
        return ResponseEntity.ok(store);
    }

    @Operation(summary = "상가 임대료 AI 예측", description = "주소/상권 변수로 월 임대료를 예측합니다.")
    @PostMapping("/predict")
    public ResponseEntity<StoreRentPredictResponseDto> predictStoreRent(
            @Valid @RequestBody StoreRentPredictRequestDto request) {
        StoreRentPredictResponseDto prediction = storeRentPredictService.predict(request);
        return ResponseEntity.ok(prediction);
    }
}
