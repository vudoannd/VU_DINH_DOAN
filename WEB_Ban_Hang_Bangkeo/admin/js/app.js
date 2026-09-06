/* ==========================================================================
 * admin/js/app.js — Khung ứng dụng quản trị: khởi động, sidebar, định tuyến
 *
 * Toàn bộ khu quản trị nằm trong MỘT trang admin/index.html, chuyển mục bằng
 * hash trên thanh địa chỉ (#/products, #/orders...). Lý do không tách thành
 * nhiều file .html: mỗi lần tải trang lại phải nạp lại sql.js (WebAssembly)
 * rồi mở lại file .db — mất cả giây. Giữ một trang thì CSDL mở đúng một lần.
 *
 * Đổi lại phải tự lo phần định tuyến, và đó là việc của file này:
 *   - Nạp CSDL, xác thực phiên đăng nhập
 *   - Dựng sidebar + topbar
 *   - Nghe hashchange, gọi hàm render của đúng mục
 *
 * File này nạp SAU tất cả page-*.js để lúc dựng menu thì các mục đã đăng ký xong.
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var $ = Admin.$, $$ = Admin.$$;
  var esc = Admin.util.esc;
  var ui = Admin.ui;

  /* ======================================================================
   * 1. CÁC MỤC ĐÃ ĐĂNG KÝ
   *
   * Sổ đăng ký nằm ở core.js (xem giải thích tại đó). File này chỉ đọc lại,
   * và vì app.js nạp sau cùng nên lúc này bảy file page-*.js đã ghi tên xong.
   * ====================================================================== */

  var pages = Admin.pages;

  /* --- Thứ tự và cách gom nhóm menu ------------------------------------
     Viết cứng ở đây chứ không suy ra từ thứ tự đăng ký, để đổi vị trí một
     mục thì sửa đúng một chỗ. */
  var NAV = [
    { group: '',            items: ['dashboard'] },
    { group: 'Bán hàng',    items: ['orders', 'products', 'categories'] },
    { group: 'Người dùng',  items: ['users', 'feedback'] },
    ];

  var DEFAULT_PAGE = 'dashboard';

  /* ======================================================================
   * 2. TRẠNG THÁI CHUNG
   * ====================================================================== */

  var current = '';       // tên mục đang mở
  Admin.me = null;        // bản ghi quản trị viên đang đăng nhập

  /* ======================================================================
   * 3. DỰNG SIDEBAR & TOPBAR
   * ====================================================================== */

  function buildSidebar() {
    var html = '';
    NAV.forEach(function (sec) {
      if (sec.group) html += '<div class="group-label">' + esc(sec.group) + '</div>';
      sec.items.forEach(function (name) {
        var p = pages[name];
        if (!p || p.hidden) return;
        html += '<a href="#/' + name + '" data-nav="' + name + '">' +
                  '<i class="bi ' + esc(p.icon || 'bi-dot') + '"></i>' +
                  '<span>' + esc(p.label || p.title) + '</span>' +
                  '<span class="count d-none" data-badge="' + name + '"></span>' +
                '</a>';
      });
    });
    $('#adminNav').innerHTML = html;
  }

  /** Cập nhật con số bên phải từng mục menu (đơn chờ xử lý, phản hồi chưa đọc...). */
  function refreshBadges() {
    Object.keys(pages).forEach(function (name) {
      var el = $('[data-badge="' + name + '"]');
      if (!el) return;
      var n = 0;
      try { n = pages[name].badge ? Number(pages[name].badge()) || 0 : 0; } catch (e) { n = 0; }
      el.textContent = n > 99 ? '99+' : String(n);
      el.classList.toggle('d-none', n <= 0);
    });
  }
  Admin.refreshBadges = refreshBadges;

  function buildTopbarUser() {
    var me = Admin.me;
    $('#adminUser').innerHTML =
      '<div class="dropdown">' +
        '<button class="btn btn-light border d-flex align-items-center gap-2 rounded-pill ' +
                'px-2 py-1" data-bs-toggle="dropdown" aria-expanded="false">' +
          '<span class="d-grid place-items-center rounded-circle bg-brand text-white fw-bold" ' +
                'style="width:30px;height:30px;font-size:.8rem;display:grid;place-items:center">' +
            esc(initials(me.fullname)) + '</span>' +
          '<span class="d-none d-md-inline fs-13 fw-semibold">' + esc(me.fullname) + '</span>' +
          '<i class="bi bi-chevron-down fs-12 text-ink-3"></i>' +
        '</button>' +
        '<ul class="dropdown-menu dropdown-menu-end shadow border-0 mt-2" style="min-width:240px">' +
          '<li class="px-3 py-2 border-bottom">' +
            '<div class="fw-semibold fs-13">' + esc(me.fullname) + '</div>' +
            '<div class="fs-12 text-ink-3">' + esc(me.email) + '</div>' +
            '<span class="badge bg-primary-subtle text-primary-emphasis mt-1 fs-12">' +
              '<i class="bi bi-shield-check me-1"></i>Quản trị viên</span>' +
          '</li>' +
          '<li><button class="dropdown-item" type="button" id="btnProfile">' +
            '<i class="bi bi-person-gear me-2"></i>Hồ sơ &amp; đổi mật khẩu</button></li>' +
          '<li><a class="dropdown-item" href="../index.html" target="_blank" rel="noopener">' +
            '<i class="bi bi-box-arrow-up-right me-2"></i>Xem website khách</a></li>' +
          '<li><hr class="dropdown-divider"></li>' +
          '<li><button class="dropdown-item text-danger" type="button" id="btnLogout">' +
            '<i class="bi bi-box-arrow-right me-2"></i>Đăng xuất</button></li>' +
        '</ul>' +
      '</div>';

    $('#btnLogout').addEventListener('click', function () {
      Admin.ui.confirm({
        title: 'Đăng xuất',
        message: 'Kết thúc phiên làm việc và quay về trang đăng nhập?',
        okText: 'Đăng xuất',
        danger: false
      }).then(function (ok) { if (ok) Admin.auth.logout('dang-xuat'); });
    });

    $('#btnProfile').addEventListener('click', function () {
      ui.toast('Tính năng đang phát triển.', 'info');
    });
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    var last = parts[parts.length - 1] || '?';
    return (parts.length > 1 ? parts[0][0] + last[0] : last.slice(0, 2)).toUpperCase();
  }

  /* ======================================================================
   * 4. ĐÓNG / MỞ SIDEBAR TRÊN MÀN HÌNH NHỎ
   * Tự viết thay vì dùng Offcanvas của Bootstrap: component Offcanvas ép
   * background-color: transparent !important ở khổ >= lg, phải chống lại
   * bằng !important nữa — dài dòng hơn là hai dòng CSS transform.
   * ====================================================================== */

  function initSidebarToggle() {
    var side = $('#adminSidebar');
    var back = $('#adminBackdrop');

    function open() { side.classList.add('is-open'); back.classList.add('is-open'); }
    function close() { side.classList.remove('is-open'); back.classList.remove('is-open'); }

    $('#adminBurger').addEventListener('click', open);
    back.addEventListener('click', close);
    side.addEventListener('click', function (e) {
      if (e.target.closest('a[data-nav]')) close();   // chọn mục xong thì đóng
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 992) close();
    });
  }

  /* ======================================================================
   * 5. ĐỊNH TUYẾN
   * ====================================================================== */

  function routeName() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return pages[h] ? h : DEFAULT_PAGE;
  }

  /**
   * Đọc tham số phía sau dấu ? trong hash: #/products?stock=0 -> {stock:'0'}.
   * Nhờ vậy các thẻ "Cần chú ý" ở trang tổng quan bấm được thẳng sang danh
   * sách đã lọc sẵn, và F5 vẫn giữ nguyên bộ lọc đó.
   */
  Admin.query = function () {
    var q = (location.hash || '').split('?')[1] || '';
    var out = {};
    new URLSearchParams(q).forEach(function (v, k) { out[k] = v; });
    return out;
  };

  function render() {
    var name = routeName();
    var p = pages[name];
    current = name;

    // Đánh dấu mục đang mở trên sidebar
    $$('#adminNav a').forEach(function (a) {
      var on = a.getAttribute('data-nav') === name;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    $('#pageTitle').textContent = p.title;
    $('#pageSub').textContent = p.sub || '';
    document.title = p.title + ' · Quản trị VGP';

    var view = $('#adminView');
    view.innerHTML = '';
    try {
      p.render(view);
    } catch (err) {
      console.error(err);
      view.innerHTML =
        '<div class="card p-4"><h2 class="h6 text-danger">' +
        '<i class="bi bi-exclamation-triangle me-2"></i>Không hiển thị được mục này</h2>' +
        '<p class="fs-13 text-ink-2 mb-0">' + esc(err.message) + '</p></div>';
    }

    refreshBadges();
    window.scrollTo(0, 0);
  }

  /** Chuyển sang một mục khác bằng mã lệnh. */
  Admin.go = function (name) {
    if (location.hash === '#/' + name) render();
    else location.hash = '#/' + name;
  };

  /** Vẽ lại mục đang mở (gọi sau khi thêm/sửa/xóa dữ liệu). */
  Admin.reload = function () { render(); };

  /* ======================================================================
   * 6. CHIP TÌNH TRẠNG LƯU CSDL
   * ====================================================================== */

  /**
   * Chip trạng thái lưu — thứ quan trọng nhất trên topbar, vì nó trả lời câu
   * hỏi "việc tôi vừa làm có vào file VuGiaPhat.db thật hay không".
   *
   * Bốn trạng thái:
   *   - Ghi thẳng vào file  : đã liên kết, còn quyền  -> xanh, không cần làm gì
   *   - Cần cấp lại quyền   : nhớ file nhưng hết quyền -> bấm để xin lại
   *   - Lưu trong trình duyệt: chưa liên kết          -> bấm để kết nối file
   *   - Chưa lưu được       : cả file lẫn IndexedDB đều hỏng -> đỏ
   */
  /* ======================================================================
   * 8. KHỞI ĐỘNG
   * ====================================================================== */

  function bootError(msg, detail) {
    $('#bootScreen').innerHTML =
      '<div class="card p-4 p-md-5 mx-3" style="max-width:620px">' +
        '<i class="bi bi-plug text-danger" style="font-size:2.4rem"></i>' +
        '<h1 class="h5 mt-3">' + esc(msg) + '</h1>' +
        '<p class="fs-13 text-ink-2">' + esc(detail || '') + '</p>' +
        '<div class="alert alert-primary border-0 border-start border-4 fs-13 text-start mb-3">' +
          '<strong>Cách chạy đúng:</strong><br>' +
          'Mở thư mục dự án trong terminal rồi chạy<br>' +
          '<code>python -m http.server 8000</code><br>' +
          'Sau đó vào <code>http://localhost:8000/admin/</code>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="location.reload()">' +
          '<i class="bi bi-arrow-clockwise me-1"></i>Thử lại</button>' +
      '</div>';
  }

    async function boot() {
    try {
      var me = await Admin.auth.verify();
      if (!me) return;
      Admin.me = me;

      buildSidebar();
      buildTopbarUser();
      initSidebarToggle();
      Admin.auth.watchIdle();

      window.addEventListener('hashchange', render);
      if (!location.hash) location.replace('#/' + DEFAULT_PAGE);
      render();
    } catch (err) {
      console.error(err);
      bootError('Khong the khoi dong', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Admin);
