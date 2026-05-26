import apiClient from '../apiClient';

export const commercialService = {
    predict: async (payload) => {
        // StoreRentPredictRequestDto 규격의 payload를 백엔드로 보냄
        const response = await apiClient.post('/api/stores/predict', payload);
        return response.data;
    }
};