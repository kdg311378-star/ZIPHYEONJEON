import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'context/AuthContext';

const AuthPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login: authLogin, signup: authSignup } = useAuth();

    const [mode, setMode] = useState('login');
    const [scrollPercent, setScrollPercent] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');



    const from = location.state?.from?.pathname || "/main";

    // 💡 1. 백엔드 DTO(SignupRequest)와 100% 일치하도록 필드 구성
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        userName: '',
        creditScore: 0,
        familyType: '1인 가구', // 초기값 설정
        incomeLevel: '중'       // 💡 백엔드 필수 필드 추가
    });



    const calculateStrength = (pwd) => {
        if (!pwd) return { label: '', color: 'bg-transparent w-0', text: '' };
        if (pwd.length < 8) return { label: 'Weak (짧음)', color: 'bg-rose-500 w-1/3', text: 'text-rose-500' };
        const hasLetter = /[A-Za-z]/.test(pwd);
        const hasNum = /\d/.test(pwd);
        const hasSpecial = /[@$!%*#?&]/.test(pwd);
        if (hasLetter && hasNum && hasSpecial) return { label: 'Strong (안전)', color: 'bg-emerald-500 w-full', text: 'text-emerald-500' };
        return { label: 'Medium (보통)', color: 'bg-amber-500 w-2/3', text: 'text-amber-500' };
    };

    const pwdStrength = calculateStrength(formData?.password || '');

    useEffect(() => {
        const handleScroll = () => {
            const winHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            setScrollPercent((window.scrollY / winHeight) * 100);
            document.querySelectorAll('.reveal').forEach(el => {
                if (el.getBoundingClientRect().top < window.innerHeight - 100) el.classList.add('active');
            });
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: name === 'creditScore' ? Number(value) : value // 숫자형 변환 처리
        });
        if (errorMsg) setErrorMsg('');
    };

    const validateFrontend = () => {
        if (mode === 'login') return true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            setErrorMsg('유효한 이메일 형식을 입력해주세요.');
            return false;
        }
        const pwdRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,20}$/;
        if (!pwdRegex.test(formData.password)) {
            setErrorMsg('비밀번호는 영문, 숫자, 특수문자를 포함해 8~20자리여야 합니다.');
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateFrontend()) return;

        setIsLoading(true);
        setErrorMsg('');

        try {
            // 💡 2. 전송 직전 데이터를 콘솔에 찍어 확인합니다. (F12에서 확인 가능)
            console.log("🚀 백엔드로 전송 시도 데이터:", formData);

            if (mode === 'login') {
                const result = await authLogin(formData.email, formData.password);
                if (result.success) {
                    navigate(from, { replace: true });
                } else {
                    setErrorMsg(result.message);
                }
            } else {
                const result = await authSignup(formData);
                if (result.success) {
                    alert('가입 신청이 완료되었습니다. 이제 로그인이 가능합니다.');
                    setMode('login');
                } else {
                    setErrorMsg(result.message);
                }
            }
        } catch (error) {
            // 💡 3. 여기가 핵심! 브라우저 F12 Console에 진짜 에러가 찍힙니다.
            console.error("🔥 [통신 실패] 상세 에러:", error);
            setErrorMsg("시스템 통신 오류가 발생했습니다. (F12 콘솔을 확인하세요)");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row min-h-screen font-sans bg-white text-slate-900">
            <style>{`
                @keyframes dash {
                    to { stroke-dashoffset: 0; }
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
            <div className="fixed top-0 left-0 h-1 bg-gradient-to-r from-blue-700 to-cyan-500 z-50 transition-all duration-100" style={{ width: `${scrollPercent}%` }}></div>

            {/* [좌측 패널] - 풀스크린 랜딩 페이지 형태 */}
            <main className="lg:w-7/12 xl:w-8/12 bg-[linear-gradient(to_bottom,#ffffff_0%,#f8fafc_25%,#0f172a_45%,#0f172a_100%)] relative">
                {/* Hero Section */}
                <section className="relative w-full min-h-[75vh] flex flex-col justify-center p-12 lg:p-16 overflow-hidden">
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50/60 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                    <div className="relative z-10 space-y-8 animate-[fadeInUp_1s_ease-out]">
                        <h1 className="text-7xl lg:text-8xl font-black tracking-tighter text-slate-900 leading-[0.9]">
                            집현전<br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">ZIPHYEONJEON</span>
                        </h1>
                        <p className="text-2xl lg:text-3xl text-slate-800 font-bold tracking-tight mt-6">
                            미래를 읽는 데이터,<br />당신의 결정을 확신으로 바꾸다.
                        </p>
                        <p className="text-lg text-slate-500 font-medium leading-relaxed max-w-xl">
                            국토교통부, 소상공인365 등 대한민국의 방대한 부동산·상권 빅데이터를 통합하여
                            가장 완벽한 초정밀 AI 예측 결과를 제공합니다.
                        </p>
                    </div>
                </section>

                {/* Residential Section */}
                <section className="w-full p-12 lg:p-16 border-t border-blue-100/50">
                    <div className="flex flex-col xl:flex-row gap-16 items-center">
                        <div className="flex-1 space-y-8 reveal">
                            <h2 className="text-4xl lg:text-5xl font-black text-white tracking-tighter leading-tight drop-shadow-md">
                                주거용 AI 부동산<br /><span className="text-blue-400">정밀 분석</span>
                            </h2>
                            <div className="space-y-6">
                                <div className="p-6 bg-white/10 backdrop-blur-md rounded-3xl border border-white/10 shadow-lg hover:bg-white/20 transition-colors duration-300">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                                        <span className="text-2xl">📈</span> 다중 시점 시세 예측
                                    </h3>
                                    <p className="text-sm text-slate-300 font-medium leading-relaxed">단순한 현재 시세가 아닌, 자체 AI 알고리즘으로 1개월, 3개월, 6개월 뒤의 아파트 매매가 및 전월세 가격 변동 추이를 정밀 예측합니다.</p>
                                </div>
                                <div className="p-6 bg-white/10 backdrop-blur-md rounded-3xl border border-white/10 shadow-lg hover:bg-white/20 transition-colors duration-300">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                                        <span className="text-2xl">💡</span> AI 적정 입찰가 제안
                                    </h3>
                                    <p className="text-sm text-slate-300 font-medium leading-relaxed">과거 실거래 추세와 시장 변동성을 종합적으로 학습하여 경매 및 매매 시 가장 합리적이고 안전한 최적의 매수 입찰가를 산출합니다.</p>
                                </div>
                            </div>
                        </div>
                        {/* Mock Chart UI for Residential */}
                        <div className="flex-1 w-full max-w-md reveal delay-200">
                            <div className="bg-[#1E293B]/80 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
                                <div className="flex justify-between items-center mb-10 relative z-10">
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-1">6개월 뒤 예측 매매가</p>
                                        <h4 className="text-3xl font-black text-white tracking-tighter">12억 5,000만</h4>
                                    </div>
                                    <span className="px-4 py-1.5 bg-rose-500/20 text-rose-400 font-black text-sm rounded-full tracking-wider border border-rose-500/30">+4.2%</span>
                                </div>
                                <svg viewBox="0 0 100 50" className="w-full h-auto overflow-visible relative z-10">
                                    {/* Grid */}
                                    <line x1="0" y1="10" x2="100" y2="10" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
                                    <line x1="0" y1="30" x2="100" y2="30" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
                                    {/* Gradient fill */}
                                    <path d="M0,40 Q20,35 40,20 T70,15 T100,5 L100,50 L0,50 Z" fill="url(#blue-grad)" className="opacity-20 animate-pulse" />
                                    {/* Line */}
                                    <path d="M0,40 Q20,35 40,20 T70,15 T100,5" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="200" strokeDashoffset="200" style={{ animation: "dash 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards" }} />
                                    <defs>
                                        <linearGradient id="blue-grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#60a5fa" />
                                            <stop offset="100%" stopColor="transparent" />
                                        </linearGradient>
                                    </defs>
                                    {/* Points */}
                                    <circle cx="40" cy="20" r="2.5" fill="#1E293B" stroke="#60a5fa" strokeWidth="1.5" className="opacity-0" style={{ animation: "fadeIn 0.5s ease-out 1s forwards" }} />
                                    <circle cx="70" cy="15" r="2.5" fill="#1E293B" stroke="#60a5fa" strokeWidth="1.5" className="opacity-0" style={{ animation: "fadeIn 0.5s ease-out 1.5s forwards" }} />
                                    <circle cx="100" cy="5" r="3.5" fill="#60a5fa" className="animate-ping opacity-0" style={{ animation: "fadeIn 0.5s ease-out 2s forwards" }} />
                                </svg>
                                <div className="flex justify-between mt-6 text-[10px] font-bold text-slate-400 relative z-10 tracking-widest">
                                    <span>현재가</span>
                                    <span>1개월</span>
                                    <span>3개월</span>
                                    <span className="text-blue-400">6개월</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Commercial Section */}
                <section className="w-full p-12 lg:p-16 relative overflow-hidden">
                    <div className="absolute top-1/2 left-0 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                    <div className="flex flex-col-reverse xl:flex-row gap-16 items-center relative z-10">
                        {/* Mock Chart UI for Commercial */}
                        <div className="flex-1 w-full max-w-md reveal delay-200">
                            <div className="bg-[#1E293B]/80 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] group relative overflow-hidden">
                                <div className="flex justify-between items-end mb-10">
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-1">실시간 유동인구 딥다이브</p>
                                        <h4 className="text-3xl font-black text-white tracking-tighter">강남구 역삼1동</h4>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                        <span className="text-[10px] font-black text-emerald-400 tracking-widest">LIVE</span>
                                    </div>
                                </div>
                                <div className="flex items-end gap-2 h-36 mb-6 group-hover:gap-3 transition-all duration-500">
                                    {[30, 45, 20, 60, 90, 100, 75, 40].map((h, i) => (
                                        <div key={i} className="flex-1 bg-slate-700/30 rounded-t-lg relative overflow-hidden h-full">
                                            <div className="absolute bottom-0 w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-lg transition-all duration-1000 ease-out" style={{ height: `${h}%` }}></div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-500 tracking-widest">
                                    <span>06:00</span>
                                    <span>12:00</span>
                                    <span>18:00</span>
                                    <span>24:00</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 space-y-8 reveal">
                            <h2 className="text-4xl lg:text-5xl font-black text-white tracking-tighter leading-tight">
                                상가 및 상권<br /><span className="text-emerald-400">빅데이터 분석</span>
                            </h2>
                            <div className="space-y-6">
                                <div className="p-6 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 hover:bg-white/10 transition-colors duration-300">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                                        <span className="text-2xl">👥</span> 15분 단위 유동인구 딥다이브
                                    </h3>
                                    <p className="text-sm text-slate-400 font-medium leading-relaxed">통신사 및 대중교통 빅데이터를 기반으로, 해당 지역 상권의 시간대별 및 연령대별 유동인구 흐름을 직관적으로 시각화합니다.</p>
                                </div>
                                <div className="p-6 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 hover:bg-white/10 transition-colors duration-300">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                                        <span className="text-2xl">🏪</span> 업종 생존율 및 점포 현황
                                    </h3>
                                    <p className="text-sm text-slate-400 font-medium leading-relaxed">소상공인365 공공데이터와 연동하여, 내가 창업하고자 하는 타겟 업종의 지역별 밀집도와 최근 5년간 생존율 추이를 파악합니다.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Footer / Scroll to top */}
                <section className="w-full p-12 flex justify-center pb-24 border-t border-white/5">
                    <button
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="px-8 py-4 bg-white/5 text-slate-300 font-black rounded-full hover:bg-white hover:text-slate-900 hover:-translate-y-1 transition-all duration-300 shadow-xl backdrop-blur-md flex items-center gap-3 tracking-widest text-sm"
                    >
                        <span>TOP</span> ⬆
                    </button>
                </section>
            </main>

            {/* [우측 패널] - 배경용 컨테이너 추가하여 흰 여백 해결 */}
            <div className="lg:w-5/12 xl:w-4/12 bg-[#0F172A] relative min-h-screen">
                <div className="lg:sticky lg:top-0 lg:h-screen w-full flex flex-col items-center justify-center p-8 overflow-hidden">


                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>

                    <div className="w-full max-w-[420px] relative z-10">

                        <div className="bg-white/5 backdrop-blur-xl p-7 lg:p-8 rounded-[40px] border border-white/10 shadow-2xl">
                            <div className="flex bg-white/5 p-1 rounded-[16px] mb-6">
                                <button onClick={() => setMode('login')} className={`flex-1 py-2.5 rounded-[12px] text-xs font-black transition-all ${mode === 'login' ? 'bg-white text-[#001A3D]' : 'text-slate-500 hover:text-slate-300'}`}>로그인</button>
                                <button onClick={() => setMode('signup')} className={`flex-1 py-2.5 rounded-[12px] text-xs font-black transition-all ${mode === 'signup' ? 'bg-white text-[#001A3D]' : 'text-slate-500 hover:text-slate-300'}`}>회원가입</button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
                                <div>
                                    <h3 className="text-2xl font-black text-white tracking-tighter">{mode === 'login' ? '로그인 인증' : '신규 가입 신청'}</h3>
                                    {errorMsg && <p className="text-red-400 text-xs font-bold mt-2 animate-pulse">⚠ {errorMsg}</p>}
                                </div>

                                <div className="space-y-3">
                                    <input
                                        name="email"
                                        type="text"
                                        placeholder="아이디 (이메일)"
                                        required
                                        className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none font-medium text-sm"
                                        value={formData.email}
                                        onChange={handleChange}
                                    />
                                    <div>
                                        <input name="password" type="password" placeholder="비밀번호" required className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none font-medium text-sm" onChange={handleChange} />
                                        {mode === 'signup' && formData.password && (
                                            <div className="mt-2 px-2 flex items-center justify-between">
                                                <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden flex">
                                                    <div className={`h-full transition-all duration-300 ${pwdStrength.color}`}></div>
                                                </div>
                                                <span className={`ml-3 text-[10px] font-black tracking-widest uppercase ${pwdStrength.text}`}>{pwdStrength.label}</span>
                                            </div>
                                        )}
                                    </div>

                                    {mode === 'signup' && (
                                        <>
                                            <input name="userName" placeholder="성명" required className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none font-medium text-sm" onChange={handleChange} />

                                            {/* 선택 항목들 */}
                                            <div className="pt-3 border-t border-white/10">
                                                <p className="text-[11px] text-slate-400 font-bold mb-2">추가 정보 (선택 사항)</p>
                                                <input name="creditScore" type="number" placeholder="신용점수 (예: 750)" className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white outline-none font-medium text-sm mb-3" onChange={handleChange} />

                                                <select name="familyType" className="w-full px-5 py-3.5 bg-[#1e293b] border border-white/10 rounded-xl text-white outline-none mb-3 text-sm" onChange={handleChange} value={formData.familyType}>
                                                    <option value="1인 가구">1인 가구</option>
                                                    <option value="2인 가구">2인 가구</option>
                                                    <option value="다자녀 가구">다자녀 가구</option>
                                                </select>

                                                <select name="incomeLevel" className="w-full px-5 py-3.5 bg-[#1e293b] border border-white/10 rounded-xl text-white outline-none text-sm" onChange={handleChange} value={formData.incomeLevel}>
                                                    <option value="상">소득 수준: 상</option>
                                                    <option value="중">소득 수준: 중</option>
                                                    <option value="하">소득 수준: 하</option>
                                                </select>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button type="submit" disabled={isLoading} className={`w-full py-3.5 rounded-xl font-black text-base transition-all shadow-lg ${isLoading ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white shadow-blue-900/40 hover:bg-blue-500 hover:-translate-y-1'}`}>
                                    {isLoading ? "처리 중..." : (mode === 'login' ? '로그인 하기' : '회원가입')}
                                </button>

                                {mode === 'login' && (
                                    <div className="pt-4 border-t border-white/10 mt-4">
                                        <p className="text-center text-[11px] text-slate-400 font-bold mb-3">소셜 계정으로 빠른 시작</p>
                                        <div className="flex gap-4">
                                            <a href={`${process.env.REACT_APP_API_URL || 'http://localhost:8080'}/oauth2/authorization/kakao`} className="flex-1 py-3 bg-[#FEE500] hover:bg-[#FDD800] text-[#000000] rounded-xl font-black text-xs flex justify-center items-center gap-1.5 transition-all hover:-translate-y-1 shadow-lg">
                                                <span>💬 카카오 로그인</span>
                                            </a>
                                            <a href={`${process.env.REACT_APP_API_URL || 'http://localhost:8080'}/oauth2/authorization/google`} className="flex-1 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-black text-xs flex justify-center items-center gap-1.5 transition-all hover:-translate-y-1 shadow-lg border border-slate-200">
                                                <span>🌐 구글 로그인</span>
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;