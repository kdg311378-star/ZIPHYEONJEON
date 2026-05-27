package io.pjj.ziphyeonjeon.global.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;

@Slf4j
@Configuration
public class AppConfig {

    @Bean
    public RestTemplate restTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(30000); // 30 seconds
        factory.setReadTimeout(120000); // 120 seconds

        RestTemplate restTemplate = new RestTemplate(factory);
        
        restTemplate.getInterceptors().add(new ClientHttpRequestInterceptor() {
            @Override
            public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution) throws IOException {
                int maxRetries = 6;
                int retryCount = 0;
                while (true) {
                    try {
                        ClientHttpResponse response = execution.execute(request, body);
                        int statusCode = response.getStatusCode().value();
                        
                        // Retry on 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
                        // Render free instances return 502 when spinning up
                        if ((statusCode == 502 || statusCode == 503 || statusCode == 504) && retryCount < maxRetries) {
                            retryCount++;
                            log.warn("[AI Wakeup Retry] AI Service might be sleeping. Retrying ({}/{}) for {}", retryCount, maxRetries, request.getURI());
                            sleepSafely(10000); // Wait 10 seconds before retrying
                            continue;
                        }
                        return response;
                    } catch (IOException e) {
                        // Connection refused or read timeout
                        if (retryCount < maxRetries) {
                            retryCount++;
                            log.warn("[AI Wakeup Retry] Connection failed. Retrying ({}/{}) for {}", retryCount, maxRetries, request.getURI());
                            sleepSafely(10000); // Wait 10 seconds before retrying
                        } else {
                            throw e;
                        }
                    }
                }
            }
            
            private void sleepSafely(long millis) {
                try {
                    Thread.sleep(millis);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });

        return restTemplate;
    }
}