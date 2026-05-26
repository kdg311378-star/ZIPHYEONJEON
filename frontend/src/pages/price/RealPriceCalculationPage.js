/**
 * [Real Price Calculation Page - Professional Integrity Final]
 * 1. 데이터 정합성: latestTradePrice가 0일 경우 '최근 매매 없음'으로 방어 처리
 * 2. 의미 명확화: 그래프가 단지별이 아닌 '지역 평균'임을 텍스트로 명시 (백엔드 쿼리 특성 반영)
 * 3. 등급 시각화: riskLevel(SAFE/DANGER)에 따른 조건부 배지 디자인 적용
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { interactionService } from '../../api/interaction/interactionService';


const REGION_MAP = {
    "서울특별시": ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"],
    "경기도": ["수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시", "화성시", "무안군"]
};

const RealPriceCalculationPage = () => {
    const navigate = useNavigate();

    // --- 1. [State] 상태 관리 ---
    const [searchParams, setSearchParams] = useState({
        sido: '서울특별시', gugun: '동작구', propertyType: '아파트', dealType: '매매',
        startYear: '2024', endYear: '2026', page: 0
    });
    const [keyword, setKeyword] = useState('');
    const [complexList, setComplexList] = useState([]);
    const [selectedProfile, setSelectedProfile] = useState(null);
    const [molitData, setMolitData] = useState({ content: [], trendGraph: [], totalPages: 0 });
    const [isCalculating, setIsCalculating] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [activeMode, setActiveMode] = useState('FILTER'); // [NEW] 현재 활성화된 검색 모드 추적


    /**
     * 2. [Action] 단지 목록 조회 (P-009)
     * [업데이트] 주소 직접 검색(ADDRESS)과 지역 필터(FILTER)를 분리하여 백엔드 인덱스 최적화 대응
     */
    const handleSearch = async (mode, targetPage = 0) => {
        setIsCalculating(true);
        setActiveMode(mode); // [NEW] 검색 모드 상태 업데이트
        try {
            // mode가 'ADDRESS'인 경우 sigungu를 비워 전지역 검색 허용, 'FILTER'인 경우 선택된 gugun 사용
            const payload = {
                sigungu: mode === 'ADDRESS' ? '' : searchParams.gugun,
                keyword: mode === 'ADDRESS' ? keyword : '',
                propertyType: searchParams.propertyType,
                page: targetPage,
                size: 20
            };

            const res = await apiClient.post('/api/price/directory', payload);
            setComplexList(res.data.content || []);
            setMolitData(prev => ({ ...prev, totalPages: res.data.totalPages }));
            setSearchParams(prev => ({ ...prev, page: targetPage }));
            setSelectedProfile(null);
        } catch (err) {
            console.error("Search Error:", err);
            alert("데이터 로드 실패");
        } finally {
            setIsCalculating(false);
        }
    };

    /**
     * 3. [Action] 단지 상세 클릭 (P-010 & P-001)
     */
    const handleComplexClick = async (item) => {
        const masterId = item.representativeHouseId || item.houseId;

        let targetGugun = searchParams.gugun;
        if (item.sigungu) {
            const tokens = item.sigungu.split(' ');
            targetGugun = tokens[tokens.length - 1] || item.sigungu;
        }

        setIsCalculating(true);
        try {
            const [profileRes, trendRes] = await Promise.all([
                apiClient.get(`/api/price/profile/${masterId}`),
                apiClient.get('/api/price/trend', {
                    params: {
                        sigungu: item.sigungu || searchParams.gugun,
                        dong: '', // 행정동을 지정하지 않으면 시군구 전체로 조회됨
                        startMonth: `${searchParams.startYear}01`,
                        endMonth: `${searchParams.endYear}12`
                    }
                })
            ]);

            setSelectedProfile(profileRes.data);
            setMolitData(prev => ({
                ...prev,
                // /api/price/trend API는 PriceTrendResponse { trends: [...] } 형식을 반환합니다.
                trendGraph: trendRes.data.trends || []
            }));

            // 타이틀 및 필터 상태에 구(Gugun) 이름 반영
            setSearchParams(prev => ({ ...prev, gugun: targetGugun }));

            // [추가] 실거래가 매물 조회 시 최근 본 매물에 추가
            try {
                await interactionService.addRecentRecord(masterId);
            } catch (recordErr) {
                console.warn("방문 기록 갱신 실패:", recordErr);
            }

            // [찜 여부 확인]
            try {
                const likedRes = await interactionService.getLikedHouses();
                const likedList = likedRes.data || likedRes || [];
                const alreadyLiked = likedList.some(f => (f.houseId || f.HOUSE_ID || f.representativeHouseId) === masterId);
                setIsLiked(alreadyLiked);
            } catch (err) {
                console.warn("찜 상태 로드 실패");
            }

        } catch (err) { alert("상세 리포트 생성 실패"); }
        finally { setIsCalculating(false); }
    };

    /**
     * 4. [Action] 찜 토글 (관심 매물 추가/해제)
     */
    const handleToggleLike = async () => {
        if (!selectedProfile) return;
        try {
            const hId = selectedProfile.houseId;
            await interactionService.toggleLike(hId);
            setIsLiked(!isLiked);
        } catch (err) {
            alert("찜 처리에 실패했습니다.");
        }
    };


    // --- UI Helper ---
    const getRiskBadge = (level) => {
        const styles = {
            'SAFE': 'bg-emerald-50 text-emerald-600 border-emerald-100',
            'DANGER': 'bg-rose-50 text-rose-600 border-rose-100',
            'CAUTION': 'bg-amber-50 text-amber-600 border-amber-100'
        };
        return <span className={`px-4 py-1 rounded-full border font-black text-[10px] ${styles[level] || 'bg-slate-50'}`}>{level}</span>;
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 bg-[#F8FAFC] min-h-screen font-sans">
            {isCalculating && <div className="fixed inset-0 z-[999] bg-white/40 backdrop-blur-sm flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div></div>}

            <header className="mb-14"><h1 className="text-4xl font-black text-slate-900 italic tracking-tighter uppercase">주거용 정밀분석 <span className="text-blue-600 text-sm font-light ml-1">원하는 매물의 실거래가 추이와 AI 예측 시세를 분석하여 최적의 거래 가치를 정밀 진단합니다.</span></h1></header>

            <main className="bg-white p-12 rounded-[50px] shadow-2xl border border-slate-100 space-y-10">
                {/* 01. 주소 직접 검색 구역 */}
                <div
                    className={`space-y-4 transition-all duration-300 cursor-pointer p-4 rounded-[30px] ${activeMode === 'FILTER' ? 'opacity-30 grayscale' : 'bg-blue-50/30'}`}
                    onClick={() => setActiveMode('ADDRESS')}
                >
                    <label className="text-[11px] font-black text-blue-600 uppercase flex items-center gap-2 tracking-widest">
                        <span className="w-2 h-2 bg-blue-600 rounded-full"></span> 01. 주소로 직접 검색
                    </label>
                    <div className="relative max-w-4xl">
                        <input
                            className={`w-full bg-slate-50 p-6 pr-20 rounded-[30px] font-bold text-lg border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all shadow-inner ${activeMode === 'FILTER' ? 'pointer-events-none' : ''}`}
                            placeholder="도로명 주소 또는 단지명을 입력하세요"
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch('ADDRESS')}
                        />
                        <button
                            onClick={(e) => { e.stopPropagation(); handleSearch('ADDRESS'); }}
                            disabled={activeMode === 'FILTER'}
                            className="absolute right-3 top-3 bottom-3 px-10 bg-blue-600 text-white rounded-[24px] font-black hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 shadow-xl flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            매물 찾기
                        </button>
                    </div>
                </div>

                {/* 구분선 */}
                <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-none mx-4 text-[10px] font-black text-slate-300 tracking-widest bg-white px-4 py-1 rounded-full border border-slate-100">또는</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                </div>

                {/* 02. 지역 필터 구역 */}
                <div
                    className={`space-y-4 transition-all duration-300 cursor-pointer p-4 rounded-[30px] ${activeMode === 'ADDRESS' ? 'opacity-30 grayscale' : 'bg-blue-50/30'}`}
                    onClick={() => setActiveMode('FILTER')}
                >
                    <label className={`text-[11px] font-black uppercase flex items-center gap-2 tracking-widest transition-colors ${activeMode === 'FILTER' ? 'text-blue-600' : 'text-slate-500'}`}>
                        <span className={`w-2 h-2 rounded-full transition-colors ${activeMode === 'FILTER' ? 'bg-blue-600' : 'bg-slate-300'}`}></span> 02. 지역 및 유형으로 필터링
                    </label>
                    <div className={`flex flex-wrap gap-3 items-center ${activeMode === 'ADDRESS' ? 'pointer-events-none' : ''}`}>
                        {/* 시도 선택 */}
                        <select
                            className="bg-white p-5 rounded-[24px] font-bold border-none shadow-sm cursor-pointer hover:bg-slate-100 transition-colors min-w-[160px]"
                            value={searchParams.sido}
                            onChange={e => {
                                const newSido = e.target.value;
                                setSearchParams({ ...searchParams, sido: newSido, gugun: REGION_MAP[newSido]?.[0] || '' });
                            }}
                        >
                            {Object.keys(REGION_MAP).map(sido => <option key={sido} value={sido}>{sido}</option>)}
                        </select>

                        {/* 구군 선택 */}
                        <select
                            className="bg-white p-5 rounded-[24px] font-bold border-none shadow-sm cursor-pointer hover:bg-slate-100 transition-colors min-w-[160px]"
                            value={searchParams.gugun}
                            onChange={e => setSearchParams({ ...searchParams, gugun: e.target.value })}
                        >
                            {REGION_MAP[searchParams.sido]?.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>

                        {/* 매물 유형 */}
                        <div className="flex bg-white p-1.5 rounded-[26px] border border-slate-100 shadow-sm">
                            {['아파트', '오피스텔', '연립다세대'].map(type => (
                                <button
                                    key={type}
                                    onClick={(e) => { e.stopPropagation(); setSearchParams({ ...searchParams, propertyType: type }); }}
                                    className={`px-7 py-3 rounded-[20px] font-black text-sm transition-all ${searchParams.propertyType === type ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    {type === '연립다세대' ? '빌라/다세대' : type}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={(e) => { e.stopPropagation(); handleSearch('FILTER'); }}
                            className="px-10 py-5 bg-blue-600 text-white rounded-[24px] font-black shadow-xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            조건으로 조회
                        </button>
                    </div>
                </div>
            </main>

            <div className="grid lg:grid-cols-12 gap-10">
                {/* 좌측 리스트 */}
                <aside className="lg:col-span-4 bg-white rounded-[45px] shadow-sm border border-slate-200 h-[750px] flex flex-col overflow-hidden">
                    <div className="p-8 bg-slate-50 border-b font-black text-slate-800 text-xs tracking-widest">03. 분석 대상 매물 목록</div>
                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                        {complexList.map((item, idx) => (
                            <div key={idx} onClick={() => handleComplexClick(item)} className={`p-8 border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition-all ${selectedProfile?.houseId === (item.representativeHouseId || item.houseId) ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-500' : ''}`}>
                                <h4 className="font-black text-slate-900 truncate">{item.complexName || item.roadAddress}</h4>
                                <p className="text-[11px] text-slate-400 font-bold mt-1 truncate">{item.roadAddress}</p>
                                <div className="mt-4 flex justify-between items-center"><span className="text-[10px] text-slate-400 font-black italic">{item.totalTransactions || 1}건 거래 기록</span><span className="text-blue-600 text-[10px] font-black">정밀 분석 →</span></div>
                            </div>
                        ))}
                    </div>
                    {molitData.totalPages > 1 && (
                        <div className="p-4 bg-slate-50 border-t flex justify-between items-center px-8">
                            <button disabled={searchParams.page === 0} onClick={() => handleSearch(activeMode, searchParams.page - 1)} className="text-xs font-black disabled:opacity-20">이전</button>
                            <span className="text-[10px] font-bold text-slate-400">{searchParams.page + 1} / {molitData.totalPages}</span>
                            <button disabled={searchParams.page + 1 >= molitData.totalPages} onClick={() => handleSearch(activeMode, searchParams.page + 1)} className="text-xs font-black disabled:opacity-20">다음</button>
                        </div>
                    )}
                </aside>

                {/* 우측 배틀보드 */}
                <main className="lg:col-span-8 space-y-8">
                    {selectedProfile ? (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                            <section className="bg-white p-12 rounded-[56px] shadow-sm border border-slate-100">
                                <header className="flex justify-between items-start mb-10 pb-8 border-b border-slate-50">
                                    <div className="flex items-center gap-6">
                                        <button
                                            onClick={handleToggleLike}
                                            className={`w-14 h-14 rounded-[20px] flex items-center justify-center text-2xl shadow-sm transition-all border ${isLiked ? 'bg-rose-50 border-rose-100 text-rose-500 scale-105' : 'bg-slate-50 border-slate-100 text-slate-300 hover:text-rose-400'
                                                }`}
                                        >
                                            {isLiked ? '❤️' : '🤍'}
                                        </button>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter">프로필</span>
                                                <h2 className="text-4xl font-black text-slate-900 tracking-tighter italic">{selectedProfile.complexName}</h2>
                                            </div>
                                            <p className="text-slate-400 font-bold text-xs uppercase">{selectedProfile.roadAddress}</p>
                                        </div>
                                    </div>
                                    {getRiskBadge(selectedProfile.riskLevel)}
                                </header>

                                <div className="grid grid-cols-3 gap-6">
                                    <div className="bg-slate-50 p-8 rounded-[40px] text-center">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-2">최근 실거래가</p>
                                        <p className="text-3xl font-black text-[#002855]">{selectedProfile.latestTradePrice > 0 ? selectedProfile.latestTradePrice.toLocaleString() : '최근 거래 없음'}</p>
                                    </div>
                                    <div className="bg-slate-50 p-8 rounded-[40px] text-center">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-tighter">전세가율</p>
                                        <p className="text-3xl font-black text-slate-800">{selectedProfile.jeonseRatio?.toFixed(1) || 0}%</p>
                                    </div>
                                    <div className="bg-slate-900 p-8 rounded-[40px] text-center text-white shadow-2xl">
                                        <p className="text-[10px] font-black text-blue-400 uppercase mb-2">AI 예측 시세</p>
                                        <p className="text-2xl font-black">{selectedProfile.aiPredictedPrice ? selectedProfile.aiPredictedPrice.toLocaleString() : '-'}</p>
                                    </div>
                                </div>
                            </section>

                            <section className="bg-white p-12 rounded-[56px] shadow-sm border border-slate-100">
                                <div className="flex justify-between items-center mb-10">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">지역 시장 가격 추이</h3>
                                    <p className="text-[9px] font-bold text-blue-500 bg-blue-50 px-3 py-1 rounded-full uppercase">※ {searchParams.gugun} 전체 평균 데이터</p>
                                </div>
                                <div className="h-[350px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={molitData.trendGraph}>
                                            <defs>
                                                <linearGradient id="colorSale" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                                                <linearGradient id="colorJeonse" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                                                <linearGradient id="colorRent" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ec4899" stopOpacity={0.1} /><stop offset="95%" stopColor="#ec4899" stopOpacity={0} /></linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="period" fontSize={10} axisLine={false} tickLine={false} />
                                            <YAxis hide /><Tooltip contentStyle={{ borderRadius: '20px', border: 'none' }} />

                                            {/* 아파트 */}
                                            {searchParams.propertyType === '아파트' && searchParams.dealType === '매매' && <Area type="monotone" name="평균 매매가(3.3㎡)" dataKey="aptSale" stroke="#2563eb" strokeWidth={4} fillOpacity={1} fill="url(#colorSale)" />}
                                            {searchParams.propertyType === '아파트' && searchParams.dealType === '전세' && <Area type="monotone" name="평균 전세가(3.3㎡)" dataKey="aptJeonse" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorJeonse)" />}
                                            {searchParams.propertyType === '아파트' && searchParams.dealType === '월세' && (
                                                <>
                                                    <Area type="monotone" name="평균 보증금" dataKey="aptWolseDeposit" stroke="#8b5cf6" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                                                    <Area type="monotone" name="평균 월세액" dataKey="aptWolseRent" stroke="#ec4899" strokeWidth={4} fillOpacity={1} fill="url(#colorRent)" />
                                                </>
                                            )}

                                            {/* 빌라(연립다세대) */}
                                            {searchParams.propertyType === '연립다세대' && searchParams.dealType === '매매' && <Area type="monotone" name="평균 매매가(3.3㎡)" dataKey="villaSale" stroke="#2563eb" strokeWidth={4} fillOpacity={1} fill="url(#colorSale)" />}
                                            {searchParams.propertyType === '연립다세대' && searchParams.dealType === '전세' && <Area type="monotone" name="평균 전세가(3.3㎡)" dataKey="villaJeonse" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorJeonse)" />}
                                            {searchParams.propertyType === '연립다세대' && searchParams.dealType === '월세' && (
                                                <>
                                                    <Area type="monotone" name="평균 보증금" dataKey="villaWolseDeposit" stroke="#8b5cf6" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                                                    <Area type="monotone" name="평균 월세액" dataKey="villaWolseRent" stroke="#ec4899" strokeWidth={4} fillOpacity={1} fill="url(#colorRent)" />
                                                </>
                                            )}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center p-20 text-center opacity-30 grayscale italic font-black text-slate-300 uppercase tracking-widest leading-loose">
                            분석할 매물을 목록에서 선택하여 <br /> 리포트를 생성하세요.
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default RealPriceCalculationPage;