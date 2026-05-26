/**
 * [Residential AI Prediction Page - Enterprise Edition]
 * 1. 🎯 데이터 정규화: targetMonth(CamelCase) 적용으로 백엔드와 완벽 호환.
 * 2. ⚡ 스마트 엔진: 도로명 주소를 파싱하여 지역구와 키워드를 자동 분리 검색.
 * 3. 🚫 구조 최적화: 입력을 최소화하고 검색 시 면적/주소/시세를 자동 바인딩.
 * 4. 🔑 경량 프로필: getSimplifiedProfile 사용으로 즉각적인 응답성 확보.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { residentialService } from '../../api/ai/residentialService';
import { interactionService } from '../../api/interaction/interactionService';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';

// ChartJS 엔진 등록
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ResidentialPredictPage = () => {
  // --- 1. [State] 입력 및 데이터 관리 ---
  const [inputs, setInputs] = useState({
    sigungu: '',        // 시군구 (검색 시 자동 입력)
    propertyType: '아파트',
    dealType: '매매',
    area: '',           // 전용면적 (자동 입력 및 수동 수정 가능)
    targetMonth: 'h1m',
    houseId: null       // representativeHouseId
  });

  const [keyword, setKeyword] = useState('');         // 도로명 주소 또는 단지명 검색어
  const [searchResults, setSearchResults] = useState([]); // 검색 결과 리스트
  const [multiResults, setMultiResults] = useState({});   // 1,3,6개월 예측 결과 저장
  const [isPredicting, setIsPredicting] = useState(false); // 로딩 상태
  const [sidebarData, setSidebarData] = useState({ liked: [], recent: [] }); // 사이드바 데이터
  const [uiMessage, setUiMessage] = useState(''); // [NEW] 화면 가이드 메시지
  const [isSearching, setIsSearching] = useState(false); // [NEW] 검색 상태 관리

  // --- 2. [Effect] 사이드바 초기 데이터 로딩 ---
  useEffect(() => {
    const fetchSidebar = async () => {
      try {
        const [likes, records] = await Promise.all([
          interactionService.getLikedHouses(),
          interactionService.getRecentRecords()
        ]);
        const extract = (res) => res.data?.data || res.data || (Array.isArray(res) ? res : []);
        setSidebarData({ liked: extract(likes), recent: extract(records) });
      } catch (err) {
        console.error("[Service Error] 사이드바 데이터 동기화 실패");
      }
    };
    fetchSidebar();
  }, []);

  /**
   * [수정] 주소 지능형 검색 (복잡한 파싱 로직을 백엔드 엔진에 위임)
   */
  const handleSearch = async () => {
    if (!keyword.trim()) return;

    // [개선] 새로운 조회 시작 시 기존 데이터와 메시지를 즉시 비움
    setSearchResults([]);
    setUiMessage("데이터를 조회하고 있습니다...");
    setIsSearching(true);

    try {
      const fullText = keyword.trim();

      // [개선] 프론트엔드의 취약한 파싱 로직을 제거하고 전체 키워드를 백엔드에 그대로 전달합니다.
      // 백엔드(PriceSearchService)가 도로명, 건물번호 등을 더 정확하게 분석합니다.
      const res = await residentialService.searchDirectory({
        keyword: fullText,
        sigungu: "", // 백엔드 내부 파서가 keyword에서 지역 정보를 추출하도록 유도
        propertyType: "", // 건물 타입 제약 없이 모든 결과를 조회
        page: 0, size: 10
      });

      if (!res.content || res.content.length === 0) {
        setUiMessage("일치하는 정보를 찾을 수 없습니다. 주소를 다시 확인해 주세요.");
        return;
      }

      setSearchResults(res.content);
      setUiMessage(""); // 성공 시 메시지 초기화
    } catch (err) {
      setUiMessage("조회 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSearching(false); // 검색 완료
    }
  };

  /**
   * 4. [Action] 매물 선택 시 경량 프로필 조회 및 자동 예측
   */
  const handleSelectProperty = async (item) => {
    const hId = item.representativeHouseId || item.houseId;
    if (!hId) return;

    try {
      // 분석 로직이 제외된 빠른 경량 프로필 API 호출
      const d = await residentialService.getSimplifiedProfile(hId);

      // 검색창에 건물 이름 대신 도로명 주소를 노출
      const displayAddress = d.roadname || d.roadAddress || "주소 정보 없음";

      const autoFillData = {
        sigungu: displayAddress.split(' ').slice(0, 3).join(' '), // 시군구동 추출
        propertyType: d.propertyType || '아파트',
        dealType: inputs.dealType,
        area: d.area || '',
        targetMonth: 'h1m',
        houseId: hId,
        currentPrice: d.latestTradePrice || 0
      };

      setInputs(autoFillData);
      setKeyword(displayAddress);
      setSearchResults([]);

      // 사이드바 이름 업데이트 (매핑용)
      const updateList = (list) => list.map(h =>
        (h.houseId === hId) ? { ...h, complexName: d.name, name: d.name } : h
      );
      setSidebarData(prev => ({
        liked: updateList(prev.liked),
        recent: updateList(prev.recent)
      }));

      // [추가] 최근 본 매물 DB 저장을 위한 API 호출
      try {
        await interactionService.addRecentRecord(hId);
      } catch (recordErr) {
        console.warn("방문 기록 추가 실패:", recordErr);
      }

      // 데이터가 채워진 후 자동으로 AI 예측 실행
      executeAIPrediction(true, autoFillData);
    } catch (err) {
      console.error("매물 상세 정보 조회 실패:", err);
      alert("매물 상세 정보를 가져오는 데 실패했습니다.");
    }
  };

  /**
   * 5. [Core Logic] AI 예측 실행 엔진
   */
  const executeAIPrediction = async (isAuto, data) => {
    // 필수 데이터(지역구, 면적)가 없으면 실행 차단
    if (!data.sigungu || !data.area) {
      if (!isAuto) setUiMessage("먼저 검색을 통해 매물을 선택하거나 지역과 면적을 입력해주세요.");
      return;
    }

    setIsPredicting(true);
    setMultiResults({});

    try {
      const months = data.dealType === '월세' ? ['h1m', 'h3m'] : ['h1m', 'h3m', 'h6m'];
      const sido = data.sigungu.split(' ')[0] || "서울특별시";

      const requests = months.map(m => {
        return residentialService.predict({
          propertyType: data.propertyType,
          dealType: data.dealType,
          sigungu: data.sigungu,
          targetMonth: m,
          features: [{
            month: new Date().getMonth() + 1,
            sido: sido,
            property_type: data.propertyType,
            // 건축년도와 층수는 시스템 기본값(10)으로 서버에 전달하여 예측 수행
            mean_building_age: 10,
            mean_floor: 10,
            mean_area: parseFloat(data.area) || 84.0
          }]
        });
      });

      const responses = await Promise.all(requests);
      const resMap = {};
      responses.forEach((res, idx) => {
        resMap[months[idx]] = res;
      });
      setMultiResults(resMap);

    } catch (err) {
      console.error("[AI Engine] 분석 실패:", err);
      alert("AI 서버와의 통신에 실패했습니다. 입력 규격을 확인하세요.");
    } finally {
      setIsPredicting(false);
    }
  };

  // --- 6. [Visualization] 그래프 데이터 계산 ---
  const chartData = useMemo(() => {
    const keys = Object.keys(multiResults);
    if (keys.length === 0) return { labels: [], datasets: [] };

    const labels = ['현재 시세', ...keys.map(k => k.replace('h', '').replace('m', '개월 후'))];
    const predictedPrices = keys.map(k => multiResults[k].predictedPrice);

    let basePrice = inputs.currentPrice;
    if (!basePrice || basePrice === 0) {
      basePrice = predictedPrices.length > 0 ? Math.round(predictedPrices[0] * 0.99) : 0;
    }

    return {
      labels,
      datasets: [{
        label: '예상가 (만원)',
        data: [basePrice, ...predictedPrices],
        borderColor: '#60A5FA',
        backgroundColor: 'rgba(96, 165, 250, 0.2)',
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointBackgroundColor: '#FFFFFF'
      }]
    };
  }, [multiResults, inputs.currentPrice]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 p-8">
      <header className="flex justify-between items-center mb-12 border-b border-slate-800 pb-6">
        <div>
          <p className="text-blue-400 text-xs font-bold tracking-widest uppercase mb-1">1초 만에 확인하는 우리 동네 주택 AI 시세 리포트</p>
          <h1 className="text-3xl font-black tracking-tight">주택 거래가 예측</h1>
        </div>
      </header>

      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          {/* Complex Finder: 도로명 주소 입력 지원 */}
          <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 shadow-xl">
            <label className="text-[10px] font-bold text-blue-400 uppercase mb-3 block">주소를 입력하세요.</label>
            <div className="flex gap-2">
              <input
                className="flex-grow bg-slate-900 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="도로명 주소 또는 단지명 입력"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  if (uiMessage) setUiMessage(""); // [개선] 타이핑 시작 시 메시지 초기화
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className={`px-4 py-2 rounded-xl font-bold transition-all ${isSearching ? 'bg-slate-700 cursor-wait' : 'bg-blue-600 hover:bg-blue-500'}`}
              >
                {isSearching ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full"></span>
                    조회중
                  </span>
                ) : "검색"}
              </button>
            </div>

            {/* [개선] 시각적 가이드 메시지: 상태에 따른 색상 구분 및 아이콘 추가 */}
            {uiMessage && (
              <p className={`mt-2 text-[10px] font-bold animate-pulse ${isSearching ? 'text-blue-400' : 'text-rose-400'}`}>
                {isSearching ? "🔍 " : "⚠️ "}{uiMessage}
              </p>
            )}

            {/* 검색 결과 드롭다운: 필드명 규격(name, roadname) 준수 */}
            {searchResults.length > 0 && (
              <div className="mt-3 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                {searchResults.map((item, i) => (
                  <div key={i} onClick={() => handleSelectProperty(item)} className="p-3 hover:bg-slate-800 cursor-pointer border-b border-slate-800 last:border-none">
                    <p className="text-xs font-bold">{item.complexName}</p>
                    <p className="text-[10px] text-slate-500">{item.roadAddress}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); executeAIPrediction(false, inputs); }} className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 shadow-xl space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <select className="bg-slate-900 rounded-xl p-3 text-sm border-none" value={inputs.dealType} onChange={e => setInputs({ ...inputs, dealType: e.target.value })}>
                <option value="매매">매매</option><option value="전세">전세</option><option value="월세">월세</option>
              </select>
              <select className="bg-slate-900 rounded-xl p-3 text-sm border-none" value={inputs.propertyType} onChange={e => setInputs({ ...inputs, propertyType: e.target.value })}>
                <option value="아파트">아파트</option>
                <option value="연립다세대">연립다세대</option>
                <option value="오피스텔">오피스텔</option>
              </select>
            </div>

            <input
              className="w-full bg-slate-900 rounded-xl p-3 text-sm border-none focus:ring-1 focus:ring-blue-500"
              placeholder="지역구 입력"
              value={inputs.sigungu}
              onChange={(e) => setInputs({ ...inputs, sigungu: e.target.value })}
            />

            <div className="grid grid-cols-1 gap-2">
              <input type="number" className="bg-slate-900 rounded-xl p-3 text-xs border-none" placeholder="전용면적(㎡) 입력" value={inputs.area} onChange={e => setInputs({ ...inputs, area: e.target.value })} />
            </div>

            <select className="w-full bg-slate-900 rounded-xl p-3 text-sm border-none" value={inputs.targetMonth} onChange={e => setInputs({ ...inputs, targetMonth: e.target.value })}>
              <option value="h1m">1개월 후</option><option value="h3m">3개월 후</option>
              {inputs.dealType !== '월세' && <option value="h6m">6개월 후</option>}
            </select>

            <button type="submit" disabled={isPredicting} className="w-full bg-blue-600 py-4 rounded-xl font-black text-lg hover:bg-blue-500 disabled:bg-slate-700 transition-all">
              {isPredicting ? "AI 분석 엔진 가동 중..." : "AI 예측 실행"}
            </button>
          </form>
        </div>

        <div className="lg:col-span-8 grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-800/30 p-8 rounded-[40px] border border-slate-800 flex flex-col justify-between">
            {Object.keys(multiResults).length > 0 ? (
              <>
                <div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">예상 가격</p>
                  <h2 className="text-6xl font-black text-blue-400">
                    {(multiResults[inputs.targetMonth]?.predictedPrice || Object.values(multiResults)[0]?.predictedPrice)?.toLocaleString()}
                    <span className="text-2xl font-light italic ml-1">만원</span>
                  </h2>
                </div>
                <div className="h-64 mt-8">
                  <Line data={chartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#1E293B' } }, x: { grid: { display: false } } } }} />
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 italic text-center p-10">
                <p>도로명 주소 검색을 통해 매물을 선택해주세요.<br />검색 시 건물 번호를 제외하면 더 정확하게 찾을 수 있습니다.</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <section className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700">
              <h4 className="text-xs font-black text-blue-400 uppercase mb-4 tracking-tighter">❤️ 찜 매물</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {sidebarData.liked.map((item, i) => (
                  <div key={i} onClick={() => handleSelectProperty(item)} className="p-3 bg-slate-900 rounded-xl cursor-pointer hover:ring-1 hover:ring-blue-500 transition-all">
                    <p className="text-[11px] font-bold truncate">{item.name || item.complexName || "이름 없는 매물"}</p>
                    <p className="text-[9px] text-slate-500 italic">클릭 시 자동 예측</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700">
              <h4 className="text-xs font-black text-slate-400 uppercase mb-4 tracking-tighter">🕒 최근 본 매물</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {sidebarData.recent.map((item, i) => (
                  <div key={i} onClick={() => handleSelectProperty(item)} className="p-3 bg-slate-900 rounded-xl cursor-pointer hover:ring-1 hover:ring-slate-500 transition-all">
                    <p className="text-[11px] font-bold truncate">{item.name || item.complexName || "이름 없는 매물"}</p>
                    <p className="text-[9px] text-slate-500 italic">클릭 시 자동 예측</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResidentialPredictPage;