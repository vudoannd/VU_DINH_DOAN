// ===========================================================================
// js/supabase-config.js
// Cấu hình kết nối tới Supabase
// Bạn cần thay thế SUPABASE_URL và SUPABASE_ANON_KEY bằng thông tin dự án
// của bạn trên trang quản trị Supabase (Project Settings -> API).
// ===========================================================================

const SUPABASE_URL = 'https://obbkixdxfoqypjdjigfw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G20FL5A9X2xYn3Kmo2xjJA_qQ9OBh9z';

// Khởi tạo client Supabase
// Biến `supabaseClient` sẽ được sử dụng ở mọi nơi (main.js, contact, admin...)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;
