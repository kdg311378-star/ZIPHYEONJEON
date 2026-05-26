package io.pjj.ziphyeonjeon.store.service;

import io.pjj.ziphyeonjeon.store.dto.StoreRentPredictRequestDto;
import io.pjj.ziphyeonjeon.store.dto.StoreRentPredictResponseDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Slf4j
@Service
@RequiredArgsConstructor
public class StoreRentPredictService {

    private final RestTemplate restTemplate;

    @Value("${ai.commercial.api.url:http://localhost:8010}")
    private String commercialAiApiUrl;

    public StoreRentPredictResponseDto predict(StoreRentPredictRequestDto request) {
        String url = commercialAiApiUrl + "/api/stores/predict";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<StoreRentPredictRequestDto> entity = new HttpEntity<>(request, headers);

        try {
            ResponseEntity<StoreRentPredictResponseDto> response =
                    restTemplate.postForEntity(url, entity, StoreRentPredictResponseDto.class);
            StoreRentPredictResponseDto body = response.getBody();
            if (body == null) {
                throw new RuntimeException("Commercial AI API returned empty response.");
            }
            return body;
        } catch (Exception e) {
            log.error("Failed to call CommercialRentAI API: {}", e.getMessage(), e);
            throw new RuntimeException("상가 임대료 AI 서버 호출에 실패했습니다.", e);
        }
    }
}

