/* ==========================================================================
 * admin/js/page-users.js — Mục "Khách hàng & tài khoản"
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var U = Admin.util, esc = U.esc, ui = Admin.ui;
  var supabase = window.supabaseClient;

  var state = { q: '', role: 'all', page: 1, size: 12 };

  /* ======================================================================
   * 1. TRUY VẤN
   * ====================================================================== */

  async function fetchAll() {
    var query = supabase.from('profiles').select(`
      id, fullname, email, phone, address, created_at, is_admin,
      order ( id, total_amount, status )
    `);
    
    if (state.role === 'admin') query = query.eq('is_admin', 1);
    if (state.role === 'customer') query = query.eq('is_admin', 0);
    
    query = query.order('is_admin', { ascending: false }).order('id', { ascending: true });

    var { data: rows, error } = await query;
    if (error) {
      console.error(error);
      return [];
    }

    var processed = rows.map(function(u) {
      var orders = u.order || [];
      var spent = 0;
      orders.forEach(function(o) {
        if (o.status !== 'cancelled') {
          spent += (o.total_amount || 0);
        }
      });
      return {
        id: u.id,
        fullname: u.fullname,
        email: u.email,
        phone: u.phone,
        address: u.address,
        created_at: u.created_at,
        is_admin: u.is_admin,
        orders: orders.length,
        spent: spent
      };
    });

    if (state.q) {
      var key = U.deaccent(state.q);
      processed = processed.filter(function (u) {
        return U.deaccent(u.fullname || '').indexOf(key) !== -1 ||
               U.deaccent(u.email || '').indexOf(key) !== -1 ||
               String(u.phone || '').indexOf(state.q.trim()) !== -1;
      });
    }
    return processed;
  }

  async function adminCount() {
    var { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_admin', 1);
    if (error) {
      console.error(error);
      return 0;
    }
    return count || 0;
  }

  /* ======================================================================
   * 2. VẼ TRANG
   * ====================================================================== */

  async function render(view) {
    view.innerHTML = '<div class="p-4 text-center"><div class="spinner-border text-primary"></div></div>';
    
    var rows = await fetchAll();
    var pages = Math.max(1, Math.ceil(rows.length / state.size));
    if (state.page > pages) state.page = pages;
    var slice = rows.slice((state.page - 1) * state.size, state.page * state.size);

    var { count: total } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    var admins = await adminCount();

    view.innerHTML =
      '<div class="card">' +
        '<div class="card-header">' +
          '<div class="d-flex flex-wrap gap-2 align-items-center w-100">' +

            '<div class="btn-group" role="group" aria-label="Lọc theo vai trò">' +
              roleChip('all', 'Tất cả', total) +
              roleChip('customer', 'Khách hàng', total - admins) +
              roleChip('admin', 'Quản trị', admins) +
            '</div>' +

            '<div class="position-relative" style="min-width:220px">' +
              '<i class="bi bi-search position-absolute text-ink-3" ' +
                 'style="left:.75rem;top:50%;transform:translateY(-50%)"></i>' +
              '<input type="search" class="form-control ps-5" id="uSearch" ' +
                     'placeholder="Tên, email hoặc số điện thoại" value="' + esc(state.q) + '" ' +
                     'aria-label="Tìm tài khoản">' +
            '</div>' +

            '<button type="button" class="btn btn-primary ms-auto" id="uAdd">' +
              '<i class="bi bi-person-plus me-1"></i>Thêm tài khoản</button>' +
          '</div>' +
        '</div>' +

        '<div class="table-responsive">' + table(slice) + '</div>' +

        '<div class="card-header border-top border-bottom-0 d-flex flex-wrap gap-2">' +
          '<span class="fs-13 text-ink-2">' +
            ui.rangeText(rows.length, state.page, state.size, 'tài khoản') + '</span>' +
          '<div class="ms-auto" id="uPager">' + ui.pager(rows.length, state.page, state.size) + '</div>' +
        '</div>' +
      '</div>';

    bind(view);
  }

  function roleChip(key, label, n) {
    var on = state.role === key;
    return '<button type="button" class="btn btn-sm btn-' + (on ? 'primary' : 'light') +
           (on ? '' : ' border') + '" data-role="' + key + '" aria-pressed="' + on + '">' +
           esc(label) + ' <span class="opacity-75">(' + (n || 0) + ')</span></button>';
  }

  function table(rows) {
    if (!rows.length) {
      return ui.emptyState('bi-people', 'Không tìm thấy tài khoản nào',
        'Thử đổi từ khóa hoặc chọn lại vai trò.');
    }

    var meId = Admin.me.id;

    return '<table class="table table-hover align-middle mb-0">' +
      '<thead><tr>' +
        '<th>Tài khoản</th><th>Liên hệ</th><th>Vai trò</th>' +
        '<th class="num">Đơn hàng</th><th class="num">Đã mua</th>' +
        '<th>Tạo lúc</th><th class="text-end" style="width:120px">Thao tác</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (u) {
        var isMe = u.id === meId;
        return '<tr>' +
          '<td>' +
            '<div class="d-flex align-items-center gap-2">' +
              '<span class="rounded-circle bg-brand-light text-brand fw-bold d-grid" ' +
                    'style="width:36px;height:36px;place-items:center;font-size:.78rem;' +
                    'flex-shrink:0">' + esc(initials(u.fullname)) + '</span>' +
              '<div class="min-w-0">' +
                '<div class="fw-semibold fs-13">' + esc(u.fullname) +
                  (isMe ? ' <span class="badge bg-brand-light text-brand fs-12">Bạn</span>' : '') +
                '</div>' +
                '<div class="fs-12 text-ink-3">Mã #' + u.id + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td class="fs-13">' + esc(u.email) +
            '<div class="fs-12 text-ink-3">' + esc(u.phone || 'Chưa có số điện thoại') + '</div></td>' +
          '<td>' + (Number(u.is_admin)
            ? '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle">' +
              '<i class="bi bi-shield-check me-1"></i>Quản trị</span>'
            : '<span class="badge bg-secondary-subtle text-secondary-emphasis border">Khách hàng</span>') +
          '</td>' +
          '<td class="num fs-13">' + (u.orders
            ? '<button type="button" class="btn btn-link p-0 text-decoration-none fw-semibold" ' +
              'data-orders="' + u.id + '">' + u.orders + '</button>'
            : '<span class="text-ink-3">0</span>') + '</td>' +
          '<td class="num fw-semibold fs-13">' + esc(U.vnd(u.spent)) + '</td>' +
          '<td class="fs-13 text-ink-2">' + esc(U.dateVN(u.created_at)) + '</td>' +
          '<td class="text-end text-nowrap">' +
            '<button type="button" class="btn btn-sm btn-light border" data-edit="' + u.id +
                   '" title="Sửa" aria-label="Sửa tài khoản"><i class="bi bi-pencil"></i></button> ' +
            '<button type="button" class="btn btn-sm btn-light border text-danger" data-del="' +
                   u.id + '" title="Xóa" aria-label="Xóa tài khoản"' +
                   (isMe ? ' disabled' : '') + '><i class="bi bi-trash"></i></button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    var last = parts[parts.length - 1] || '?';
    return (parts.length > 1 ? parts[0][0] + last[0] : last.slice(0, 2)).toUpperCase();
  }

  function bind(view) {
    view.querySelectorAll('[data-role]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.role = b.getAttribute('data-role');
        state.page = 1;
        Admin.reload();
      });
    });

    view.querySelector('#uSearch').addEventListener('input', U.debounce(function (e) {
      state.q = e.target.value;
      state.page = 1;
      Admin.reload();
      var box = document.querySelector('#uSearch');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }, 280));

    view.querySelector('#uAdd').addEventListener('click', function () { openForm(null); });

    view.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openForm(Number(b.getAttribute('data-edit'))); });
    });
    view.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { remove(Number(b.getAttribute('data-del'))); });
    });
    view.querySelectorAll('[data-orders]').forEach(function (b) {
      b.addEventListener('click', function () {
        ordersOf(Number(b.getAttribute('data-orders')));
      });
    });

    var pager = view.querySelector('#uPager');
    if (pager) pager.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-page]');
      if (!btn) return;
      state.page = Number(btn.getAttribute('data-page'));
      Admin.reload();
    });
  }

  /* ======================================================================
   * 3. XEM ĐƠN CỦA MỘT KHÁCH
   * ====================================================================== */

  async function ordersOf(userId) {
    var { data: u } = await supabase.from('profiles').select('fullname').eq('id', userId).single();
    var { data: rows } = await supabase
      .from('order')
      .select('id, order_date, status, total_amount')
      .eq('user_id', userId)
      .order('order_date', { ascending: false });

    rows = rows || [];

    ui.modal({
      title: 'Đơn hàng của ' + (u ? u.fullname : '#' + userId),
      size: 'lg',
      body:
        '<div class="table-responsive border rounded-3">' +
          '<table class="table table-sm table-hover align-middle mb-0">' +
            '<thead><tr><th>Mã đơn</th><th>Ngày đặt</th>' +
              '<th class="num">Tổng tiền</th><th>Trạng thái</th></tr></thead><tbody>' +
            rows.map(function (o) {
              return '<tr class="cursor-pointer" data-open="' + o.id + '">' +
                '<td class="fw-semibold text-brand">#' + o.id + '</td>' +
                '<td class="fs-13">' + esc(U.dateTimeVN(o.order_date)) + '</td>' +
                '<td class="num fw-semibold">' + esc(U.vnd(o.total_amount)) + '</td>' +
                '<td>' + ui.statusBadge(o.status) + '</td></tr>';
            }).join('') +
          '</tbody></table>' +
        '</div>',
      footer: '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Đóng</button>',
      onReady: function (body, close, el) {
        el.querySelectorAll('[data-open]').forEach(function (tr) {
          tr.addEventListener('click', function () {
            var id = Number(tr.getAttribute('data-open'));
            close();
            setTimeout(function () { Admin.openOrder(id); }, 260);
          });
        });
      }
    });
  }

  /* ======================================================================
   * 4. THÊM / SỬA TÀI KHOẢN
   * ====================================================================== */

  async function openForm(id) {
    var u = null;
    if (id) {
      var { data } = await supabase.from('profiles').select('*').eq('id', id).single();
      u = data;
    } else {
      u = { id: null, fullname: '', email: '', phone: '', address: '', is_admin: 0 };
    }
    if (!u) return;

    var isMe = id === Admin.me.id;
    var admins = await adminCount();
    var lastAdmin = Number(u.is_admin) === 1 && admins <= 1;

    ui.modal({
      title: id ? 'Sửa tài khoản #' + id : 'Thêm tài khoản mới',
      size: 'lg',
      body:
        '<form id="userForm" novalidate>' +
          '<div class="row g-3">' +
            '<div class="col-md-6">' +
              '<label class="form-label" for="u-name">Họ và tên <span class="text-danger">*</span></label>' +
              '<input class="form-control" id="u-name" name="fullname" value="' +
                esc(u.fullname) + '">' +
            '</div>' +
            '<div class="col-md-6">' +
              '<label class="form-label" for="u-email">Email <span class="text-danger">*</span></label>' +
              '<input class="form-control" id="u-email" name="email" type="email" value="' +
                esc(u.email) + '">' +
              '<div class="form-text fs-12">Email này cũng có thể làm tên đăng nhập.</div>' +
            '</div>' +
            '<div class="col-md-6">' +
              '<label class="form-label" for="u-phone">Điện thoại</label>' +
              '<input class="form-control" id="u-phone" name="phone" value="' +
                esc(u.phone || '') + '" placeholder="0901234567">' +
            '</div>' +
            '<div class="col-md-6">' +
              '<label class="form-label d-block">Vai trò</label>' +
              '<div class="form-check form-switch mt-2">' +
                '<input class="form-check-input" type="checkbox" role="switch" id="u-admin" ' +
                       'name="is_admin"' + (Number(u.is_admin) ? ' checked' : '') +
                       ((isMe || lastAdmin) ? ' disabled' : '') + '>' +
                '<label class="form-check-label fs-13" for="u-admin">Có quyền quản trị</label>' +
              '</div>' +
              (isMe
                ? '<div class="form-text fs-12 text-warning-emphasis">' +
                  '<i class="bi bi-lock me-1"></i>Không tự gỡ quyền của chính mình được.</div>'
                : lastAdmin
                  ? '<div class="form-text fs-12 text-warning-emphasis">' +
                    '<i class="bi bi-lock me-1"></i>Đây là quản trị viên cuối cùng.</div>'
                  : '') +
            '</div>' +
            '<div class="col-12">' +
              '<label class="form-label" for="u-addr">Địa chỉ</label>' +
              '<input class="form-control" id="u-addr" name="address" value="' +
                esc(u.address || '') + '">' +
            '</div>' +

            '<div class="col-12"><hr class="my-1"></div>' +
            '<div class="col-12">' +
              '<div class="fw-semibold fs-13">' + (id ? 'Mật khẩu (Đã bỏ qua)' : 'Mật khẩu (Đã bỏ qua)') + '</div>' +
              '<p class="fs-12 text-ink-3 mb-2">Đăng nhập được xử lý bởi Supabase Auth.</p>' +
            '</div>' +
          '</div>' +
        '</form>',
      footer:
        '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Hủy</button>' +
        '<button type="button" class="btn btn-primary" data-save>' +
          '<i class="bi bi-check-lg me-1"></i>' + (id ? 'Lưu thay đổi' : 'Tạo tài khoản') + '</button>',
      onReady: function (body, close, el) {
        el.querySelector('[data-save]').addEventListener('click', function () {
          save(el, id, u, isMe, lastAdmin, close);
        });
      }
    });
  }

  async function save(el, id, original, isMe, lastAdmin, close) {
    var form = el.querySelector('#userForm');
    var R = ui.RULE;

    var rules = {
      fullname: [R.minLen(2, 'Họ tên cần ít nhất 2 ký tự.')],
      email: [R.email('Email chưa đúng định dạng, ví dụ: ten@congty.com')],
      phone: [R.phoneVN('Số điện thoại chưa hợp lệ, ví dụ: 0901234567.')]
    };
    if (!ui.validate(form, rules)) return;

    var mail = form.elements.email.value.trim();
    
    var { data: existing } = await supabase.from('profiles').select('id').ilike('email', mail).neq('id', id || 0);
    var dup = (existing && existing.length > 0) ? existing[0] : null;

    if (dup) {
      ui.setFieldError(form.elements.email, 'Email này đã có tài khoản khác dùng (mã #' + dup.id + ').');
      return;
    }

    var isAdmin = (isMe || lastAdmin)
      ? Number(original.is_admin)
      : (form.elements.is_admin.checked ? 1 : 0);

    var data = {
      fullname: form.elements.fullname.value.trim(),
      email: mail,
      phone: form.elements.phone.value.trim() || null,
      address: form.elements.address.value.trim() || null,
      is_admin: isAdmin
    };

    try {
      if (id) {
        var { error } = await supabase.from('profiles').update(data).eq('id', id);
        if (error) throw error;
        ui.toast('Đã lưu tài khoản.', 'ok');
      } else {
        data.created_at = new Date().toISOString();
        var { error: insertErr } = await supabase.from('profiles').insert([data]);
        if (insertErr) throw insertErr;
        ui.toast('Đã tạo tài khoản cho ' + data.fullname + '.', 'ok');
      }
      close();
      Admin.reload();
    } catch (err) {
      ui.toast('Không lưu được: ' + err.message, 'err');
    }
  }

  /* ======================================================================
   * 5. XÓA TÀI KHOẢN
   * ====================================================================== */

  async function remove(id) {
    var { data: u } = await supabase.from('profiles').select('fullname, is_admin').eq('id', id).single();
    if (!u) return;

    if (id === Admin.me.id) {
      ui.toast('Không thể xóa chính tài khoản bạn đang dùng để đăng nhập.', 'err');
      return;
    }
    
    var admins = await adminCount();
    if (Number(u.is_admin) === 1 && admins <= 1) {
      ui.toast('Đây là quản trị viên cuối cùng — xóa đi sẽ không còn ai vào được /admin.', 'err');
      return;
    }

    var { count: orders, error } = await supabase.from('order').select('*', { count: 'exact', head: true }).eq('user_id', id);
    if (orders > 0) {
      ui.modal({
        title: 'Không thể xóa tài khoản này',
        body:
          '<p class="mb-2">Khách hàng <strong>' + esc(u.fullname) + '</strong> đang gắn với ' +
            '<strong>' + orders + ' đơn hàng</strong>.</p>' +
          '<p class="fs-13 text-ink-2 mb-0">Xóa tài khoản sẽ làm các đơn đó mất thông tin người ' +
            'mua, không còn tra cứu hay đối chiếu công nợ được. Hãy xóa hoặc chuyển các đơn ' +
            'hàng đó trước, rồi mới xóa tài khoản.</p>',
        footer:
          '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Đóng</button>' +
          '<button type="button" class="btn btn-primary" data-go>' +
            '<i class="bi bi-receipt me-1"></i>Xem đơn của khách này</button>',
        onReady: function (body, close, el) {
          el.querySelector('[data-go]').addEventListener('click', function () {
            close();
            setTimeout(function () { ordersOf(id); }, 260);
          });
        }
      });
      return;
    }

    ui.confirm({
      title: 'Xóa tài khoản?',
      rawMessage: 'Xóa vĩnh viễn tài khoản <strong>' + esc(u.fullname) + '</strong>? ' +
                  'Thao tác này không hoàn tác được.',
      okText: 'Xóa tài khoản'
    }).then(async function (ok) {
      if (!ok) return;
      var { error: delErr } = await supabase.from('profiles').delete().eq('id', id);
      if (delErr) {
        ui.toast('Lỗi khi xóa: ' + delErr.message, 'err');
        return;
      }
      ui.toast('Đã xóa tài khoản.', 'ok');
      Admin.reload();
    });
  }

  Admin.page('users', {
    title: 'Khách hàng',
    label: 'Khách hàng',
    sub: 'Tài khoản khách và quản trị viên',
    icon: 'bi-people',
    render: render
  });
})(window.Admin);
