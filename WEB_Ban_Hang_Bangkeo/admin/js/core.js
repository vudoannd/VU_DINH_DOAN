/* ==========================================================================
 * admin/js/core.js — Tiện ích dùng chung cho khu quản trị
 *
 * Không có bước build, không dùng ES module (để mở bằng file:// cũng không
 * vướng CORS của module). Mỗi file là một IIFE gắn vào một không gian tên
 * chung là window.Admin.
 *
 * Thứ tự nạp bắt buộc: core -> db -> auth -> chart -> page-*.js -> app
 * ========================================================================== */

window.Admin = window.Admin || {};

(function (Admin) {
  'use strict';

  /* ======================================================================
   * 0. SỔ ĐĂNG KÝ CÁC MỤC QUẢN TRỊ
   *
   * Phải nằm ở core.js chứ không phải app.js: mỗi file page-*.js gọi
   * Admin.page(...) ngay lúc được nạp, mà app.js lại nạp SAU tất cả chúng
   * (nó cần biết đủ danh sách mục mới dựng được sidebar). Đặt sổ đăng ký ở
   * đây thì file nạp sớm nhất đã tạo sẵn chỗ ghi tên.
   *
   * def: {
   *   title  : tiêu đề hiện trên topbar
   *   label  : nhãn ngắn trên sidebar (thiếu thì lấy title)
   *   sub    : dòng mô tả nhỏ dưới tiêu đề
   *   icon   : lớp Bootstrap Icons cho mục menu
   *   hidden : true -> có đường dẫn nhưng không hiện trên sidebar
   *   badge  : hàm trả về con số hiện bên phải mục menu (0/null thì ẩn)
   *   render : hàm (elKhungNoiDung) -> vẽ nội dung mục
   * }
   * ====================================================================== */

  var pages = {};

  Admin.page = function (name, def) { pages[name] = def; };
  Admin.pages = pages;

  /* ======================================================================
   * 1. TRUY VẤN DOM & CHUỖI
   * ====================================================================== */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  /** Chặn chèn HTML từ dữ liệu người dùng nhập (tên sản phẩm, ghi chú...). */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Bỏ dấu tiếng Việt để tìm kiếm "không dấu" — gõ "bang keo" vẫn ra "băng keo".
   * Giữ nguyên cách làm của js/main.js bên website khách cho nhất quán.
   */
  function deaccent(s) {
    return String(s || '')
      .normalize('NFD')
      // Viết dạng \u escape vì các dấu tổ hợp vô hình trong mã nguồn
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase();
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait || 250);
    };
  }

  /* ======================================================================
   * 2. ĐỊNH DẠNG SỐ & NGÀY
   * ====================================================================== */

  var nfInt = new Intl.NumberFormat('vi-VN');
  var nfVnd = new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0
  });

  function num(n) {
    return (typeof n === 'number' && isFinite(n)) ? nfInt.format(n) : '—';
  }

  function vnd(n) {
    return (typeof n === 'number' && isFinite(n)) ? nfVnd.format(n) : '—';
  }

  /* Rút gọn tiền cho nhãn trục biểu đồ nằm ở chart.js (hàm tickMaker), vì nó
     phải chốt một đơn vị chung cho cả trục — việc đó cần biết giá trị lớn
     nhất của biểu đồ, không phải của riêng một con số. */

  /** '2026-07-14 09:20:00' -> '14/07/2026' */
  function dateVN(s) {
    var d = parseDT(s);
    if (!d) return esc(s);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /** '2026-07-14 09:20:00' -> '14/07/2026 09:20' */
  function dateTimeVN(s) {
    var d = parseDT(s);
    if (!d) return esc(s);
    return dateVN(s) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /**
   * SQLite lưu ngày dạng 'YYYY-MM-DD HH:MM:SS'. Safari không nhận chuỗi này
   * trong new Date() nên phải tự tách, không dựa vào bộ phân tích của trình duyệt.
   */
  function parseDT(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) {
      var d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Chuỗi ngày giờ hiện tại theo đúng định dạng SQLite dùng để lưu. */
  function nowSQL() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
           pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /** 'YYYY-MM' của một chuỗi ngày, dùng để gom doanh thu theo tháng. */
  function ym(s) { return String(s || '').slice(0, 7); }

  /* ======================================================================
   * 3. TRẠNG THÁI ĐƠN HÀNG
   * 4 giá trị đúng bằng ràng buộc CHECK của cột "order".status trong schema.
   * Mỗi trạng thái luôn đi kèm BIỂU TƯỢNG + NHÃN CHỮ, màu chỉ là kênh phụ.
   * ====================================================================== */

  var STATUS = {
    pending:   { label: 'Chờ xử lý',      icon: 'bi-hourglass-split',  key: 'pending' },
    paid:      { label: 'Đã thanh toán',  icon: 'bi-credit-card-2-front', key: 'paid' },
    shipped:   { label: 'Đã giao',        icon: 'bi-truck',            key: 'shipped' },
    cancelled: { label: 'Đã hủy',         icon: 'bi-x-circle',         key: 'cancelled' }
  };
  var STATUS_ORDER = ['pending', 'paid', 'shipped', 'cancelled'];

  function statusBadge(st) {
    var s = STATUS[st] || { label: st, icon: 'bi-question-circle', key: 'pending' };
    return '<span class="badge-st ' + esc(s.key) + '">' +
             '<i class="bi ' + s.icon + '"></i>' + esc(s.label) +
           '</span>';
  }

  /* ======================================================================
   * 4. ẢNH DỰ PHÒNG
   * Dùng lại đúng ảnh SVG nội tuyến của website khách để không bao giờ vỡ ảnh.
   * ====================================================================== */

  var FALLBACK_IMG =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">' +
      '<rect width="200" height="150" fill="#E8F4FC"/>' +
      '<circle cx="100" cy="66" r="36" fill="none" stroke="#017DC7" stroke-width="6"/>' +
      '<circle cx="100" cy="66" r="13" fill="none" stroke="#017DC7" stroke-width="6"/>' +
      '<text x="100" y="128" text-anchor="middle" font-family="sans-serif" ' +
      'font-size="14" fill="#017DC7">Chua co anh</text></svg>'
    );

  var IMG_DIR = '../images/products/';

  function imgTag(file, cls, alt) {
    var src = file ? IMG_DIR + encodeURIComponent(file).replace(/\.(png|jpg|jpeg)$/i, '.webp') : FALLBACK_IMG;
    return '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '" ' +
           'class="' + esc(cls || 'thumb') + '" loading="lazy" ' +
           'onerror="this.onerror=null;this.src=\'' + FALLBACK_IMG + '\'">';
  }

  /* ======================================================================
   * 5. THÔNG BÁO NỔI (Toast của Bootstrap)
   * ====================================================================== */

  function toast(msg, type) {
    var wrap = $('.toast-container');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      wrap.style.zIndex = '1090';
      document.body.appendChild(wrap);
    }

    var map = {
      ok:   { icon: 'bi-check-circle-fill', cls: 'text-success' },
      err:  { icon: 'bi-exclamation-triangle-fill', cls: 'text-danger' },
      warn: { icon: 'bi-exclamation-circle-fill', cls: 'text-warning' }
    };
    var m = map[type] || { icon: 'bi-info-circle-fill', cls: 'text-primary' };

    var el = document.createElement('div');
    el.className = 'toast align-items-center border-0 shadow';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<div class="d-flex">' +
        '<div class="toast-body d-flex align-items-center gap-2">' +
          '<i class="bi ' + m.icon + ' ' + m.cls + ' fs-5"></i><span>' + esc(msg) + '</span>' +
        '</div>' +
        '<button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" ' +
                'aria-label="Đóng"></button>' +
      '</div>';
    wrap.appendChild(el);

    var t = new bootstrap.Toast(el, { delay: type === 'err' ? 6000 : 3500 });
    el.addEventListener('hidden.bs.toast', function () { el.remove(); });
    t.show();
  }

  /* ======================================================================
   * 6. HỘP THOẠI (Modal của Bootstrap)
   * ====================================================================== */

  /**
   * Mở một modal dựng động rồi tự gỡ khỏi DOM khi đóng.
   * opts: { title, body, footer, size ('lg'|'xl'|''), onReady(bodyEl, close) }
   * Trả về { el, bs, close }.
   */
  function modal(opts) {
    var o = opts || {};
    var el = document.createElement('div');
    el.className = 'modal fade';
    el.tabIndex = -1;
    el.innerHTML =
      '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable ' +
           (o.size ? 'modal-' + o.size : '') + '">' +
        '<div class="modal-content border-0 shadow-lg" style="border-radius:.9rem">' +
          '<div class="modal-header">' +
            '<h2 class="modal-title h5 mb-0">' + (o.rawTitle || esc(o.title || '')) + '</h2>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal" ' +
                    'aria-label="Đóng"></button>' +
          '</div>' +
          '<div class="modal-body">' + (o.body || '') + '</div>' +
          (o.footer === null ? '' : '<div class="modal-footer">' + (o.footer || '') + '</div>') +
        '</div>' +
      '</div>';

    document.body.appendChild(el);
    var bs = new bootstrap.Modal(el, { backdrop: o.static ? 'static' : true });
    el.addEventListener('hidden.bs.modal', function () { el.remove(); });

    function close() { bs.hide(); }
    if (typeof o.onReady === 'function') o.onReady($('.modal-body', el), close, el);
    bs.show();
    return { el: el, bs: bs, close: close };
  }

  /**
   * Hỏi xác nhận trước khi làm việc không lùi lại được (xóa, đặt lại CSDL).
   * Trả về Promise<boolean>.
   */
  function confirmBox(opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var answered = false;
      var m = modal({
        title: o.title || 'Xác nhận',
        body: '<p class="mb-0">' + (o.rawMessage || esc(o.message || '')) + '</p>',
        footer:
          '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">' +
            (esc(o.cancelText || 'Hủy bỏ')) + '</button>' +
          '<button type="button" class="btn btn-' + (o.danger === false ? 'primary' : 'danger') +
                 '" data-ok>' + esc(o.okText || 'Xóa') + '</button>',
        onReady: function (body, close, el) {
          $('[data-ok]', el).addEventListener('click', function () {
            answered = true;
            resolve(true);
            close();
          });
          el.addEventListener('hidden.bs.modal', function () {
            if (!answered) resolve(false);
          });
        }
      });
      // Giữ tham chiếu để trình gom rác không dọn sớm
      void m;
    });
  }

  /* ======================================================================
   * 7. KHỐI TRẠNG THÁI RỖNG & PHÂN TRANG
   * ====================================================================== */

  function emptyState(icon, title, desc, actionHTML) {
    return '<div class="empty-state">' +
             '<i class="bi ' + esc(icon || 'bi-inbox') + '"></i>' +
             '<h3>' + esc(title || 'Chưa có dữ liệu') + '</h3>' +
             (desc ? '<p class="mb-3 fs-13">' + esc(desc) + '</p>' : '') +
             (actionHTML || '') +
           '</div>';
  }

  /**
   * Thanh phân trang. Chỉ hiện tối đa 7 ô số để không tràn hàng.
   * Nút mang thuộc tính data-page="<số>" — nơi gọi tự bắt sự kiện.
   */
  function pager(total, page, size) {
    var pages = Math.max(1, Math.ceil(total / size));
    if (pages <= 1) return '';

    var from = Math.max(1, Math.min(page - 3, pages - 6));
    var to = Math.min(pages, from + 6);
    var html = '<nav><ul class="pagination pagination-sm mb-0">';

    function item(label, p, disabled, active) {
      return '<li class="page-item' + (disabled ? ' disabled' : '') + (active ? ' active' : '') + '">' +
             '<button type="button" class="page-link" data-page="' + p + '"' +
             (disabled ? ' tabindex="-1"' : '') + '>' + label + '</button></li>';
    }

    html += item('<i class="bi bi-chevron-left"></i>', page - 1, page <= 1, false);
    if (from > 1) html += item('1', 1, false, false) +
                          (from > 2 ? '<li class="page-item disabled"><span class="page-link">…</span></li>' : '');
    for (var i = from; i <= to; i++) html += item(String(i), i, false, i === page);
    if (to < pages) html += (to < pages - 1 ? '<li class="page-item disabled"><span class="page-link">…</span></li>' : '') +
                            item(String(pages), pages, false, false);
    html += item('<i class="bi bi-chevron-right"></i>', page + 1, page >= pages, false);

    return html + '</ul></nav>';
  }

  /** Dòng chữ "Hiển thị 1–12 trên 24 mục". */
  function rangeText(total, page, size, unit) {
    if (!total) return 'Không có mục nào';
    var a = (page - 1) * size + 1;
    var b = Math.min(total, page * size);
    return 'Hiển thị <strong>' + a + '–' + b + '</strong> trên ' + num(total) + ' ' + esc(unit || 'mục');
  }

  /* ======================================================================
   * 8. KIỂM TRA Ô NHẬP (dùng lớp .is-invalid của Bootstrap)
   * ====================================================================== */

  /**
   * Hiện / xóa thông báo lỗi của một ô nhập.
   *
   * Chỗ đặt thông báo tìm theo thứ tự:
   *   1. Ô có sẵn id="err-<tên trường>" trong cùng form (giống cách
   *      contact.html bên website khách đang làm)
   *   2. Ô .invalid-feedback đã có sẵn cạnh ô nhập
   *   3. Không có thì tự tạo một ô mới
   *
   * Với ô nằm trong .input-group phải chèn lỗi SAU cả cụm chứ không phải sau
   * ô nhập: Bootstrap chỉ hiện .invalid-feedback khi nó là anh em kế tiếp ở
   * cùng cấp, nhét vào giữa input-group là mất luôn bo góc lẫn thông báo.
   * Vì thế cũng đặt display thẳng bằng style thay vì trông chờ vào bộ chọn
   * mặc định của Bootstrap.
   */
  function setFieldError(field, msg) {
    if (!field) return;

    var host = field.closest('.input-group') || field;
    var scope = field.form || document;
    var box = (field.name && scope.querySelector('#err-' + field.name)) ||
              (host.parentNode && host.parentNode.querySelector('.invalid-feedback'));

    if (!box) {
      box = document.createElement('div');
      box.className = 'invalid-feedback';
      host.parentNode.insertBefore(box, host.nextSibling);
    }

    field.classList.toggle('is-invalid', !!msg);
    if (msg) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');

    box.textContent = msg || '';
    box.style.display = msg ? 'block' : '';
  }

  /**
   * Chạy bộ quy tắc trên một form.
   * rules: { tenTruong: [ { test(value, form), msg } ] }
   * Trả về true nếu hợp lệ; ô sai đầu tiên được focus.
   */
  function validate(form, rules) {
    var firstBad = null;
    Object.keys(rules).forEach(function (name) {
      var field = form.elements[name];
      if (!field) return;
      var msg = '';
      rules[name].some(function (r) {
        if (!r.test(field.value, form)) { msg = r.msg; return true; }
        return false;
      });
      setFieldError(field, msg);
      if (msg && !firstBad) firstBad = field;
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  var RULE = {
    required: function (msg) {
      return { test: function (v) { return String(v).trim() !== ''; }, msg: msg };
    },
    minLen: function (n, msg) {
      return { test: function (v) { return String(v).trim().length >= n; }, msg: msg };
    },
    email: function (msg) {
      return {
        test: function (v) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v).trim()); },
        msg: msg
      };
    },
    phoneVN: function (msg) {
      return {
        test: function (v) {
          var s = String(v).replace(/[\s.\-()]/g, '');
          return s === '' || /^(0|\+84)\d{9,10}$/.test(s);   // để trống được
        },
        msg: msg
      };
    },
    intRange: function (min, max, msg) {
      return {
        test: function (v) {
          var n = Number(String(v).replace(/[^\d-]/g, ''));
          return String(v).trim() !== '' && isFinite(n) && n >= min && n <= max;
        },
        msg: msg
      };
    }
  };

  /* ======================================================================
   * 9. XUẤT RA
   * ====================================================================== */

  Admin.$ = $;
  Admin.$$ = $$;
  Admin.util = {
    esc: esc, deaccent: deaccent, debounce: debounce,
    num: num, vnd: vnd,
    dateVN: dateVN, dateTimeVN: dateTimeVN, parseDT: parseDT, nowSQL: nowSQL, ym: ym, pad: pad,
    imgTag: imgTag, FALLBACK_IMG: FALLBACK_IMG, IMG_DIR: IMG_DIR
  };
  Admin.STATUS = STATUS;
  Admin.STATUS_ORDER = STATUS_ORDER;
  Admin.ui = {
    toast: toast, modal: modal, confirm: confirmBox,
    emptyState: emptyState, pager: pager, rangeText: rangeText,
    statusBadge: statusBadge,
    validate: validate, setFieldError: setFieldError, RULE: RULE
  };
})(window.Admin);
