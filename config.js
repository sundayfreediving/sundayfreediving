/* =========================================================
   선데이프리다이빙 PWA · 환경 설정
   ---------------------------------------------------------
   1) Supabase를 연결하지 않으면 '로컬 체험 모드'로 실행됩니다.
      (수업일정·버디 글·훈련기록이 이 기기의 localStorage에만 저장)
   2) 아래 두 값을 채우면 자동으로 클라우드 모드로 전환됩니다.
      SUPABASE_URL      : https://xxxxxxxx.supabase.co
      SUPABASE_ANON_KEY : eyJhbGciOi... (anon public 키)
   ========================================================= */
window.SFD_CONFIG = {
  SUPABASE_URL: "https://zkasgmwpxvselxksdkez.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_s0T_Sx7NuSxHLCxy8Jo4gw_JfboGij7",

  // 관리자(김병선 대표) 계정 — 이 이메일로 로그인하면 자동으로 관리자 모드가 됩니다.
  ADMIN_EMAIL: "sundayfreediving@gmail.com",

  APP_VERSION: "1.4.5"
};
