import React, { useState } from 'react';
import { commercialService } from 'api/ai/commercialService';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const CommercialPredictPage = () => {
    const [inputs, setInputs] = useState({
        address: '',
        sigungu: '',
        commercialType: '중대형 상가',
        buildingUse: '근린생활시설',
        zoning: '상업지역',
        areaM2: '',
        floor: '',
        builtYear: '',
        targetMonth: 'h1m'
    });
    const [result, setResult] = useState(null);
    const [isPredicting, setIsPredicting] = useState(false);

    const handlePredict = async (e) => {
        e.preventDefault();
        if (!inputs.sigungu || !inputs.areaM2) {
            alert("시/군/구와 전용면적은 필수 입력 항목입니다.");
            return;
        }
        setIsPredicting(true);

        const payload = {
            address: inputs.address,
            sigungu: inputs.sigungu,
            commercialType: inputs.commercialType,
            buildingUse: inputs.buildingUse,
            zoning: inputs.zoning,
            builtYear: parseFloat(inputs.builtYear) || 0.0,
            areaM2: parseFloat(inputs.areaM2),
            floor: parseFloat(inputs.floor) || 1,
            targetMonth: inputs.targetMonth
        };

        try {
            const data = await commercialService.predict(payload);
            setResult(data);
        } catch (error) {
            // 💡 404(모델 없음), 400(규격 오류) 등을 구분하여 대응
            if (error.response?.status === 404) {
                alert("해당 조건(예: 6개월 모델)은 현재 AI가 학습 중입니다. 1개월/3개월로 시도해 보세요.");
            } else {
                alert("상가 분석 서버 응답이 지연되고 있습니다.");
            }
            console.error("Prediction Error:", error);
        } finally {
            setIsPredicting(false);
        }
    };

    // [예측 범위 차트 데이터 구성]
    const areaMultiplier = 1; // AI가 이미 '총 월세액'을 반환하므로 곱할 필요 없음
    const rangeChartData = result ? {
        labels: ['최저 예상 (하한)', 'AI 예측 (기준)', '최고 예상 (상한)'],
        datasets: [
            {
                type: 'bar',
                label: '총 월 임대료 (만원)',
                data: [
                    (result.predictionRange?.lower) || 0,
                    (result.predictedMonthlyRent) || 0,
                    (result.predictionRange?.upper) || 0
                ],
                backgroundColor: [
                    'rgba(99, 102, 241, 0.4)', // 하한선 (흐린 파랑)
                    'rgba(16, 185, 129, 0.8)', // 예측 기준선 (선명한 에메랄드)
                    'rgba(244, 63, 94, 0.4)'   // 상한선 (흐린 핑크)
                ],
                barThickness: 60,
                borderRadius: 12,
            }
        ]
    } : null;

    return (
        <div className="p-8 bg-slate-900 min-h-screen text-white">
            <header className="mb-10">
                <span className="text-emerald-400 font-black text-xs uppercase tracking-widest">
                    1초 만에 확인하는 우리 동네 상가 AI 시세 리포트
                </span>
                <h1 className="text-4xl font-black mt-2">🏢 상가 임대료 AI 예측</h1>
                <p className="text-slate-400 mt-3 text-sm font-semibold">예측을 원하시는 상가의 기본 정보를 입력해 주세요.</p>
            </header>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* 검색 필터 섹션 */}
                <form onSubmit={handlePredict} className="lg:col-span-4 space-y-6 bg-white/5 p-8 rounded-[40px] border border-white/10">
                    
                    {/* 위치 정보 섹션 */}
                    <div className="space-y-4">
                        <h2 className="text-emerald-400 font-bold text-sm border-b border-white/10 pb-2 flex items-center gap-2">📍 위치 정보</h2>
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 ml-1">전체 주소</label>
                            <input className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                placeholder="예: 서울특별시 은평구 연서로29길"
                                value={inputs.address}
                                onChange={e => setInputs({ ...inputs, address: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 ml-1">시/군/구 <span className="text-emerald-500">*</span></label>
                            <input className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                placeholder="예: 은평구"
                                value={inputs.sigungu}
                                onChange={e => setInputs({ ...inputs, sigungu: e.target.value })} />
                        </div>
                    </div>

                    {/* 상가 상세 정보 섹션 */}
                    <div className="space-y-4 pt-2">
                        <h2 className="text-emerald-400 font-bold text-sm border-b border-white/10 pb-2 flex items-center gap-2">🏢 상가 상세 정보</h2>
                        
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 ml-1">건물 용도</label>
                            <select className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                value={inputs.buildingUse}
                                onChange={e => setInputs({ ...inputs, buildingUse: e.target.value })}>
                                <option value="근린생활시설">근린생활시설</option>
                                <option value="제1종근생">제1종 근린생활시설</option>
                                <option value="제2종근생">제2종 근린생활시설</option>
                                <option value="판매시설">판매시설</option>
                                <option value="업무시설">업무시설</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-400 ml-1">상가 유형</label>
                                <select className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                    value={inputs.commercialType}
                                    onChange={e => setInputs({ ...inputs, commercialType: e.target.value })}>
                                    <option value="중대형 상가">중대형 상가</option>
                                    <option value="소규모 상가">소규모 상가</option>
                                    <option value="단지내 상가">단지내 상가</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-400 ml-1">용도 지역</label>
                                <select className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                    value={inputs.zoning}
                                    onChange={e => setInputs({ ...inputs, zoning: e.target.value })}>
                                    <option value="상업지역">상업지역</option>
                                    <option value="주거지역">주거지역</option>
                                    <option value="공업지역">공업지역</option>
                                    <option value="녹지지역">녹지지역</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-400 ml-1">전용면적(㎡) <span className="text-emerald-500">*</span></label>
                                <input type="number" className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                    placeholder="예: 100" value={inputs.areaM2} onChange={e => setInputs({ ...inputs, areaM2: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-400 ml-1">층수</label>
                                <input type="number" className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                    placeholder="예: 1 (지하는 -1)" value={inputs.floor} onChange={e => setInputs({ ...inputs, floor: e.target.value })} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 ml-1">준공 연도</label>
                            <input type="number" className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                placeholder="예: 2018" value={inputs.builtYear} onChange={e => setInputs({ ...inputs, builtYear: e.target.value })} />
                        </div>
                    </div>

                    {/* 예측 설정 섹션 */}
                    <div className="space-y-4 pt-2">
                        <h2 className="text-emerald-400 font-bold text-sm border-b border-white/10 pb-2 flex items-center gap-2">⏱ 예측 설정</h2>
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 ml-1">예측 목표 기간</label>
                            <select className="w-full bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 ring-emerald-500 font-bold text-sm"
                                value={inputs.targetMonth}
                                onChange={e => setInputs({ ...inputs, targetMonth: e.target.value })}>
                                <option value="h1m">1개월 후 예측</option>
                                <option value="h6m">6개월 후 예측</option>
                            </select>
                        </div>
                    </div>

                    <button type="submit" disabled={isPredicting}
                        className={`w-full py-5 mt-2 rounded-[28px] font-black text-lg transition-all ${isPredicting ? 'bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-900/10'}`}>
                        {isPredicting ? "AI 모델 분석 중..." : "임대료 예측 실행"}
                    </button>
                </form>

                {/* 분석 결과 섹션 */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-gradient-to-br from-emerald-600 to-teal-800 p-10 rounded-[50px] shadow-2xl flex justify-between items-center">
                        <div>
                            <h3 className="text-emerald-100 font-bold text-xs uppercase tracking-widest mb-2">예상 임대료</h3>
                            {result ? (
                                <>
                                    <div className="text-7xl font-black tracking-tighter">
                                        {/* AI가 반환한 값은 이미 총 월세액입니다 */}
                                        {Math.floor(result.predictedMonthlyRent).toLocaleString()} <span className="text-2xl font-bold text-emerald-200">만원</span>
                                    </div>
                                    <div className="mt-2 text-emerald-200/70 font-bold tracking-widest">
                                        (1㎡ 당 {(result.predictedMonthlyRent / (parseFloat(inputs.areaM2) || 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })} 만원 / 1평 당 {((result.predictedMonthlyRent / (parseFloat(inputs.areaM2) || 1)) * 3.3058).toLocaleString(undefined, { maximumFractionDigits: 1 })} 만원)
                                    </div>
                                </>
                            ) : <div className="text-emerald-200/40 text-xl font-bold italic">지역을 검색하여 분석을 시작하세요.</div>}
                        </div>
                    </div>

                    {rangeChartData && (
                        <div className="bg-white/5 p-10 rounded-[50px] border border-white/10">
                            <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                                <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
                                AI 임대료 예측 신뢰 구간
                            </h3>
                            <div className="h-[350px]">
                                <Chart type='bar' data={rangeChartData} options={{
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { display: false },
                                        title: { display: true, text: `AI 신뢰도: ${result.confidence?.toUpperCase() || '알 수 없음'}`, color: '#94a3b8' }
                                    },
                                    scales: {
                                        y: {
                                            position: 'left',
                                            title: { display: true, text: '총 월 임대료 (만원)', color: '#10b981' },
                                            grid: { color: 'rgba(255,255,255,0.05)' }
                                        }
                                    }
                                }} />
                            </div>
                        </div>
                    )}

                    {/* AI 예측 주의 문구 */}
                    <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-2xl flex items-start gap-3 mt-8">
                        <span className="text-amber-500 text-xl">⚠️</span>
                        <p className="text-amber-500/80 text-sm leading-relaxed font-bold">
                            본 예측 결과는 인공지능(AI)이 부동산 공공데이터를 바탕으로 산출한 추정치이며, 실제 시장 임대료와 차이가 있을 수 있습니다. 
                            계약 및 투자 시에는 반드시 참고용으로만 활용해 주시기 바랍니다.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommercialPredictPage;