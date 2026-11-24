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

  // 관리자(김병선 대표) 계정 — 이 이메일만 수업일정을 수정할 수 있습니다.
  ADMIN_EMAIL: "sundayfreediving@gmail.com",

  // 로컬 체험 모드에서만 쓰이는 관리자 PIN (클라우드 모드에서는 사용 안 함)
  LOCAL_ADMIN_PIN: "0619",

  APP_VERSION: "1.2.4"
};
