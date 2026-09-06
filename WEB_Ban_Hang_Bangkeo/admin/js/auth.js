/* ==========================================================================
 * admin/js/auth.js — Đăng nhập & phiên làm việc của quản trị viên (Supabase)
 *
 * Sử dụng Supabase Auth kết hợp với sessionStorage.
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var KEY = 'vgp_admin_session';
  var IDLE_MS = 45 * 60 * 1000;

  function session() {
    var raw;
    try { raw = sessionStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;

    var s;
    try { s = JSON.parse(raw); } catch (e) { clear(); return null; }
    if (!s || !s.id || !s.email) { clear(); return null; }

    if (Date.now() - (s.seen || 0) > IDLE_MS) { clear(); return null; }
    return s;
  }

  function touch() {
    var s = session();
    if (!s) return null;
    s.seen = Date.now();
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* bỏ qua */ }
    return s;
  }

  function start(user) {
    var s = {
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      at: Date.now(),
      seen: Date.now()
    };
    sessionStorage.setItem(KEY, JSON.stringify(s));
    return s;
  }

  function clear() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* bỏ qua */ }
  }

  /* Đăng nhập với Supabase Auth */
  async function login(email, password) {
    var mail = String(email || '').trim().toLowerCase();

    // Gọi Supabase signInWithPassword
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email: mail,
      password: password
    });

    if (authError) {
      throw new Error(authError.message === 'Invalid login credentials' 
        ? 'Email hoặc mật khẩu không đúng.' : authError.message);
    }

    // Lấy thông tin profile
    const { data: u, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, fullname, email, is_admin')
      .eq('email', mail)
      .single();

    if (profileError || !u) {
      throw new Error('Tài khoản không tồn tại trong hệ thống quản trị.');
    }

    if (Number(u.is_admin) !== 1) {
      await supabaseClient.auth.signOut();
      throw new Error('Tài khoản này không có quyền quản trị.');
    }

    start(u);
    return u;
  }

  async function logout(reason) {
    clear();
    await supabaseClient.auth.signOut();
    var qs = reason ? '?ly_do=' + encodeURIComponent(reason) : '';
    location.replace('login.html' + qs);
  }

  function guard() {
    if (session()) { touch(); return true; }
    clear();
    location.replace('login.html?ly_do=' + encodeURIComponent('het-phien'));
    return false;
  }

  async function verify() {
    var s = session();
    if (!s) { logout('het-phien'); return null; }

    const { data: u, error } = await supabaseClient
      .from('profiles')
      .select('id, fullname, email, phone, address, created_at, is_admin')
      .eq('email', s.email)
      .single();

    if (error || !u) { logout('khong-ton-tai'); return null; }
    if (Number(u.is_admin) !== 1) { logout('mat-quyen'); return null; }

    if (u.fullname !== s.fullname || u.email !== s.email) {
      s.fullname = u.fullname;
      s.email = u.email;
      try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* bỏ qua */ }
    }
    return u;
  }

  function watchIdle() {
    var events = ['click', 'keydown', 'scroll', 'touchstart'];
    var throttled = false;

    events.forEach(function (ev) {
      window.addEventListener(ev, function () {
        if (throttled) return;
        throttled = true;
        setTimeout(function () { throttled = false; }, 30000);
        touch();
      }, { passive: true });
    });

    setInterval(function () {
      if (!session()) logout('het-phien');
    }, 60000);
  }

  var REASONS = {
    'het-phien': 'Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.',
    'dang-xuat': 'Bạn đã đăng xuất khỏi khu quản trị.',
    'mat-quyen': 'Tài khoản của bạn không còn quyền quản trị.',
    'khong-ton-tai': 'Tài khoản của bạn không còn trong hệ thống.'
  };

  Admin.auth = {
    login: login, logout: logout,
    session: session, touch: touch, clear: clear,
    guard: guard, verify: verify, watchIdle: watchIdle,
    REASONS: REASONS,
    IDLE_MS: IDLE_MS
  };
})(window.Admin);
