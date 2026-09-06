/* ==========================================================================
 * admin/js/page-orders.js — Mục "Đơn hàng"
 *
 * Xem, tạo, sửa, đổi trạng thái và xóa đơn hàng cùng các dòng hàng của nó.
 *
 * BẤT BIẾN PHẢI GIỮ: "order".total_amount LUÔN bằng SUM(order_item.subtotal)
 * của chính đơn đó.
 *
 * order_item.unit_price CHÉP LẠI giá tại thời điểm đặt chứ không tham chiếu
 * product.price, để sau này đổi bảng giá thì đơn cũ không bị đổi tiền theo.
 * Form vì thế cho sửa đơn giá của từng dòng, mặc định lấy giá hiện hành.
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var U = Admin.util, esc = U.esc, ui = Admin.ui;
  var supabase = window.supabaseClient;

  var state = { q: '', status: 'all', sort: 'date-desc', page: 1, size: 15 };

  var SORTS = {
    'date-desc':  { label: 'Mới nhất trước',   col: 'order_date', asc: false },
    'date-asc':   { label: 'Cũ nhất trước',    col: 'order_date', asc: true },
    'total-desc': { label: 'Tiền nhiều → ít',  col: 'total_amount', asc: false },
    'total-asc':  { label: 'Tiền ít → nhiều',  col: 'total_amount', asc: true }
  };

  /* ======================================================================
   * 1. TRUY VẤN
   * ====================================================================== */

  async function fetchAll() {
    var query = supabase
      .from('order')
      .select('id, user_id, order_date, status, total_amount, profiles(fullname, email), order_item(quantity)');

    if (state.status !== 'all') {
      query = query.eq('status', state.status);
    }

    var sortConfig = SORTS[state.sort] || SORTS['date-desc'];
    query = query.order(sortConfig.col, { ascending: sortConfig.asc });
    if (sortConfig.col === 'order_date') {
      query = query.order('id', { ascending: sortConfig.asc });
    }

    var { data: rawRows, error } = await query;
    if (error) {
      console.error(error);
      return [];
    }

    var rows = rawRows.map(function(o) {
      var lines = o.order_item ? o.order_item.length : 0;
      var units = o.order_item ? o.order_item.reduce(function(sum, item) { return sum + (item.quantity || 0); }, 0) : 0;
      return {
        id: o.id,
        user_id: o.user_id,
        order_date: o.order_date,
        status: o.status,
        total_amount: o.total_amount,
        fullname: o.profiles ? o.profiles.fullname : null,
        email: o.profiles ? o.profiles.email : null,
        lines: lines,
        units: units
      };
    });

    if (state.q) {
      var key = U.deaccent(state.q);
      rows = rows.filter(function (o) {
        return U.deaccent(o.fullname || '').indexOf(key) !== -1 ||
               U.deaccent(o.email || '').indexOf(key) !== -1 ||
               String(o.id) === state.q.replace('#', '').trim();
      });
    }
    return rows;
  }

  async function items(orderId) {
    var { data, error } = await supabase
      .from('order_item')
      .select('*, product(name, image)')
      .eq('order_id', orderId)
      .order('id', { ascending: true });
    
    if (error) {
      console.error(error);
      return [];
    }
    
    return data.map(function(oi) {
      return {
        id: oi.id,
        order_id: oi.order_id,
        product_id: oi.product_id,
        quantity: oi.quantity,
        unit_price: oi.unit_price,
        subtotal: oi.subtotal,
        name: oi.product ? oi.product.name : null,
        image: oi.product ? oi.product.image : null
      };
    });
  }

  async function statusCounts() {
    var { data, error } = await supabase
      .from('order')
      .select('status');
      
    var out = { all: 0 };
    if (error || !data) return out;
    
    data.forEach(function (r) {
      if (!out[r.status]) out[r.status] = 0;
      out[r.status]++;
      out.all++;
    });
    return out;
  }

  /* ======================================================================
   * 2. VẼ TRANG
   * ====================================================================== */

  async function render(view) {
    var q = Admin.query();
    if (q.status !== undefined) { state.status = q.status; state.page = 1; }

    var counts = await statusCounts();
    var rows = await fetchAll();
    var pages = Math.max(1, Math.ceil(rows.length / state.size));
    if (state.page > pages) state.page = pages;
    var slice = rows.slice((state.page - 1) * state.size, state.page * state.size);

    var sum = rows.reduce(function (s, o) {
      return s + (o.status === 'cancelled' ? 0 : o.total_amount);
    }, 0);

    view.innerHTML =
      '<div class="card">' +
        '<div class="card-header">' +
          '<div class="d-flex flex-wrap gap-2 align-items-center w-100">' +

            '<div class="btn-group" role="group" aria-label="Lọc theo trạng thái">' +
              chip('all', 'Tất cả', counts.all) +
              Admin.STATUS_ORDER.map(function (k) {
                return chip(k, Admin.STATUS[k].label, counts[k] || 0);
              }).join('') +
            '</div>' +

            '<div class="position-relative" style="min-width:200px">' +
              '<i class="bi bi-search position-absolute text-ink-3" ' +
                 'style="left:.75rem;top:50%;transform:translateY(-50%)"></i>' +
              '<input type="search" class="form-control ps-5" id="oSearch" ' +
                     'placeholder="Tên khách hoặc mã đơn" value="' + esc(state.q) + '" ' +
                     'aria-label="Tìm đơn hàng">' +
            '</div>' +

            '<select class="form-select w-auto" id="oSort" aria-label="Sắp xếp">' +
              Object.keys(SORTS).map(function (k) {
                return '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>' +
                       esc(SORTS[k].label) + '</option>';
              }).join('') +
            '</select>' +

            '<button type="button" class="btn btn-primary ms-auto" id="oAdd">' +
              '<i class="bi bi-plus-lg me-1"></i>Tạo đơn hàng</button>' +
          '</div>' +
        '</div>' +

        '<div class="table-responsive">' + table(slice) + '</div>' +

        '<div class="card-header border-top border-bottom-0 d-flex flex-wrap gap-3 align-items-center">' +
          '<span class="fs-13 text-ink-2">' +
            ui.rangeText(rows.length, state.page, state.size, 'đơn hàng') + '</span>' +
          '<span class="fs-13 text-ink-2">Tổng tiền (bỏ đơn đã hủy): ' +
            '<strong class="text-brand">' + esc(U.vnd(sum)) + '</strong></span>' +
          '<div class="ms-auto" id="oPager">' + ui.pager(rows.length, state.page, state.size) + '</div>' +
        '</div>' +
      '</div>';

    bind(view);
  }

  function chip(key, label, n) {
    var on = state.status === key;
    return '<button type="button" class="btn btn-sm btn-' + (on ? 'primary' : 'light') +
           (on ? '' : ' border') + '" data-status="' + key + '" aria-pressed="' + on + '">' +
           esc(label) + ' <span class="opacity-75">(' + n + ')</span></button>';
  }

  function table(rows) {
    if (!rows.length) {
      return ui.emptyState('bi-receipt', 'Không có đơn hàng nào',
        'Thử bỏ bớt bộ lọc, hoặc bấm "Tạo đơn hàng" để thêm đơn mới.');
    }

    return '<table class="table table-hover align-middle mb-0">' +
      '<thead><tr>' +
        '<th>Mã đơn</th><th>Khách hàng</th><th>Ngày đặt</th>' +
        '<th class="num">Số lượng</th><th class="num">Tổng tiền</th>' +
        '<th style="min-width:170px">Trạng thái</th>' +
        '<th class="text-end" style="width:120px">Thao tác</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (o) {
        return '<tr data-id="' + o.id + '">' +
          '<td><button type="button" class="btn btn-link p-0 fw-bold text-decoration-none" ' +
                     'data-view="' + o.id + '">#' + o.id + '</button></td>' +
          '<td>' +
            (o.fullname
              ? '<div class="fw-semibold fs-13">' + esc(o.fullname) + '</div>' +
                '<div class="fs-12 text-ink-3">' + esc(o.email || '') + '</div>'
              : '<span class="text-ink-3 fst-italic fs-13">Khách đã bị xóa</span>') +
          '</td>' +
          '<td class="fs-13">' + esc(U.dateTimeVN(o.order_date)) + '</td>' +
          '<td class="num fs-13">' + U.num(o.units) +
            '<div class="fs-12 text-ink-3">' + o.lines + ' dòng</div></td>' +
          '<td class="num fw-semibold">' + esc(U.vnd(o.total_amount)) + '</td>' +
          '<td>' +
            '<select class="form-select form-select-sm" data-st="' + o.id + '" ' +
                    'aria-label="Đổi trạng thái đơn ' + o.id + '">' +
              Admin.STATUS_ORDER.map(function (k) {
                return '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' +
                       esc(Admin.STATUS[k].label) + '</option>';
              }).join('') +
            '</select>' +
          '</td>' +
          '<td class="text-end text-nowrap">' +
            '<button type="button" class="btn btn-sm btn-light border" data-view="' + o.id +
                   '" title="Xem chi tiết"><i class="bi bi-eye"></i></button> ' +
            '<button type="button" class="btn btn-sm btn-light border" data-edit="' + o.id +
                   '" title="Sửa đơn"><i class="bi bi-pencil"></i></button> ' +
            '<button type="button" class="btn btn-sm btn-light border text-danger" data-del="' +
                   o.id + '" title="Xóa đơn"><i class="bi bi-trash"></i></button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function bind(view) {
    view.querySelectorAll('[data-status]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.status = b.getAttribute('data-status');
        state.page = 1;
        if (location.hash.indexOf('?') !== -1) {
          history.replaceState(null, '', location.pathname + '#/orders');
        }
        Admin.reload();
      });
    });

    view.querySelector('#oSearch').addEventListener('input', U.debounce(function (e) {
      state.q = e.target.value;
      state.page = 1;
      Admin.reload();
      var box = document.querySelector('#oSearch');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }, 280));

    view.querySelector('#oSort').addEventListener('change', function (e) {
      state.sort = e.target.value;
      Admin.reload();
    });

    view.querySelector('#oAdd').addEventListener('click', function () { openEditor(null); });

    view.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { detail(Number(b.getAttribute('data-view'))); });
    });
    view.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(Number(b.getAttribute('data-edit'))); });
    });
    view.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { remove(Number(b.getAttribute('data-del'))); });
    });

    view.querySelectorAll('[data-st]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        setStatus(Number(sel.getAttribute('data-st')), sel.value);
      });
    });

    var pager = view.querySelector('#oPager');
    if (pager) pager.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-page]');
      if (!btn) return;
      state.page = Number(btn.getAttribute('data-page'));
      Admin.reload();
    });
  }

  /* ======================================================================
   * 3. ĐỔI TRẠNG THÁI
   * ====================================================================== */

  function setStatus(id, status) {
    if (Admin.STATUS_ORDER.indexOf(status) === -1) return;

    if (status === 'cancelled') {
      ui.confirm({
        title: 'Hủy đơn hàng #' + id + '?',
        message: 'Đơn đã hủy sẽ bị loại khỏi mọi con số doanh thu trên trang tổng quan.',
        okText: 'Hủy đơn này',
        cancelText: 'Giữ nguyên'
      }).then(function (ok) {
        if (!ok) { Admin.reload(); return; }
        apply(id, status);
      });
      return;
    }
    apply(id, status);
  }

  async function apply(id, status) {
    var { error } = await supabase.from('order').update({ status: status }).eq('id', id);
    if (error) {
      ui.toast('Lỗi cập nhật trạng thái: ' + error.message, 'err');
      return;
    }
    ui.toast('Đơn #' + id + ': ' + Admin.STATUS[status].label.toLowerCase() + '.', 'ok');
    Admin.refreshBadges();
  }

  /* ======================================================================
   * 4. XEM CHI TIẾT
   * ====================================================================== */

  async function detail(id) {
    var { data: o, error } = await supabase
      .from('order')
      .select('*, profiles(fullname, email, phone, address)')
      .eq('id', id)
      .single();
      
    if (error || !o) { ui.toast('Không tìm thấy đơn hàng.', 'err'); return; }
    
    if (o.profiles) {
      o.fullname = o.profiles.fullname;
      o.email = o.profiles.email;
      o.phone = o.profiles.phone;
      o.address = o.profiles.address;
    }

    var lines = await items(id);
    var sum = lines.reduce(function (s, r) { return s + r.subtotal; }, 0);

    ui.modal({
      rawTitle: 'Đơn hàng <span class="text-brand">#' + id + '</span> ' +
                ui.statusBadge(o.status),
      size: 'lg',
      body:
        '<div class="row g-3 mb-3">' +
          info('Khách hàng', o.fullname || 'Khách đã bị xóa') +
          info('Liên hệ', (o.email || '—') + (o.phone ? ' · ' + o.phone : '')) +
          info('Ngày đặt', U.dateTimeVN(o.order_date)) +
          info('Địa chỉ', o.address || '—') +
        '</div>' +

        '<div class="table-responsive border rounded-3">' +
          '<table class="table table-sm align-middle mb-0">' +
            '<thead><tr><th>Sản phẩm</th><th class="num">SL</th>' +
              '<th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>' +
            '<tbody>' +
              (lines.length ? lines.map(function (r) {
                return '<tr>' +
                  '<td><div class="d-flex gap-2 align-items-center">' +
                    U.imgTag(r.image, 'thumb', r.name || '') +
                    '<span class="clamp-2 fs-13">' +
                      (r.name ? esc(r.name)
                              : '<em class="text-danger">Sản phẩm #' + r.product_id +
                                ' không còn trong CSDL</em>') +
                    '</span></div></td>' +
                  '<td class="num">' + U.num(r.quantity) + '</td>' +
                  '<td class="num fs-13">' + esc(U.vnd(r.unit_price)) + '</td>' +
                  '<td class="num fw-semibold">' + esc(U.vnd(r.subtotal)) + '</td>' +
                '</tr>';
              }).join('')
                : '<tr><td colspan="4" class="text-center text-ink-3 py-4">' +
                  'Đơn này chưa có dòng hàng nào</td></tr>') +
            '</tbody>' +
            '<tfoot class="table-light"><tr>' +
              '<th colspan="3" class="text-end">Tổng cộng</th>' +
              '<th class="num text-brand">' + esc(U.vnd(o.total_amount)) + '</th>' +
            '</tr></tfoot>' +
          '</table>' +
        '</div>' +

        (sum !== o.total_amount
          ? '<div class="alert alert-warning fs-13 mt-3 mb-0">' +
            '<i class="bi bi-exclamation-triangle me-1"></i>Tổng tiền đang ghi ' +
            esc(U.vnd(o.total_amount)) + ' nhưng cộng các dòng hàng lại ra ' +
            esc(U.vnd(sum)) + '. Mở "Sửa đơn" rồi lưu lại để tính lại cho khớp.</div>'
          : ''),
      footer:
        '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Đóng</button>' +
        '<button type="button" class="btn btn-primary" data-edit>' +
          '<i class="bi bi-pencil me-1"></i>Sửa đơn</button>',
      onReady: function (body, close, el) {
        el.querySelector('[data-edit]').addEventListener('click', function () {
          close();
          setTimeout(function () { openEditor(id); }, 260);
        });
      }
    });
  }

  function info(label, value) {
    return '<div class="col-sm-6">' +
             '<div class="fs-12 text-ink-3">' + esc(label) + '</div>' +
             '<div class="fw-semibold fs-13">' + esc(value) + '</div>' +
           '</div>';
  }

  Admin.openOrder = detail;

  /* ======================================================================
   * 5. TẠO / SỬA ĐƠN
   * ====================================================================== */

  async function openEditor(id) {
    var o = null;
    if (id) {
      var { data: existingO, error } = await supabase.from('order').select('*').eq('id', id).single();
      if (error) { ui.toast('Không lấy được đơn hàng: ' + error.message, 'err'); return; }
      o = existingO;
    } else {
      o = { id: null, user_id: null, order_date: U.nowSQL(), status: 'pending', total_amount: 0 };
    }

    var { data: users } = await supabase.from('profiles').select('id, fullname, email').order('fullname');
    if (!users) users = [];
    
    // We select price just in case it exists, if not it will be undefined/ignored gracefully
    var { data: products } = await supabase.from('product').select('id, name, price, image').order('name');
    if (!products) products = [];

    var lines = id ? (await items(id)).map(function (r) {
      return { product_id: r.product_id, quantity: r.quantity, unit_price: r.unit_price };
    }) : [];

    ui.modal({
      title: id ? 'Sửa đơn hàng #' + id : 'Tạo đơn hàng mới',
      size: 'xl',
      static: true,
      body:
        '<form id="ordForm" novalidate>' +
          '<div class="row g-3 mb-3">' +
            '<div class="col-md-5">' +
              '<label class="form-label" for="o-user">Khách hàng <span class="text-danger">*</span></label>' +
              '<select class="form-select" id="o-user" name="user_id">' +
                '<option value="">— Chọn khách hàng —</option>' +
                users.map(function (u) {
                  return '<option value="' + u.id + '"' +
                         (String(o.user_id) === String(u.id) ? ' selected' : '') + '>' +
                         esc(u.fullname || '') + ' (' + esc(u.email || '') + ')</option>';
                }).join('') +
              '</select>' +
            '</div>' +
            '<div class="col-md-4">' +
              '<label class="form-label" for="o-date">Ngày đặt <span class="text-danger">*</span></label>' +
              '<input type="datetime-local" class="form-control" id="o-date" name="order_date" ' +
                     'value="' + esc(toLocalInput(o.order_date)) + '">' +
            '</div>' +
            '<div class="col-md-3">' +
              '<label class="form-label" for="o-status">Trạng thái</label>' +
              '<select class="form-select" id="o-status" name="status">' +
                Admin.STATUS_ORDER.map(function (k) {
                  return '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' +
                         esc(Admin.STATUS[k].label) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div class="d-flex align-items-center gap-2 mb-2">' +
            '<h3 class="h6 fw-bold mb-0">Dòng hàng</h3>' +
            '<button type="button" class="btn btn-sm btn-light border ms-auto" id="addLine">' +
              '<i class="bi bi-plus-lg me-1"></i>Thêm dòng</button>' +
          '</div>' +

          '<div class="table-responsive border rounded-3">' +
            '<table class="table table-sm align-middle mb-0">' +
              '<thead><tr>' +
                '<th style="min-width:240px">Sản phẩm</th>' +
                '<th style="width:110px" class="num">Số lượng</th>' +
                '<th style="width:150px" class="num">Đơn giá</th>' +
                '<th style="width:140px" class="num">Thành tiền</th>' +
                '<th style="width:48px"></th>' +
              '</tr></thead>' +
              '<tbody id="lineBody"></tbody>' +
              '<tfoot class="table-light"><tr>' +
                '<th colspan="3" class="text-end">Tổng cộng</th>' +
                '<th class="num text-brand" id="lineTotal">0 ₫</th><th></th>' +
              '</tr></tfoot>' +
            '</table>' +
          '</div>' +
          '<div class="form-text fs-12 mt-2">Đơn giá mặc định lấy theo bảng giá hiện tại nhưng ' +
            'sửa được: CSDL chép cứng giá tại thời điểm đặt, nên sau này đổi giá sản phẩm thì ' +
            'đơn cũ vẫn giữ nguyên số tiền đã chốt.</div>' +
        '</form>',
      footer:
        '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Hủy</button>' +
        '<button type="button" class="btn btn-primary" data-save>' +
          '<i class="bi bi-check-lg me-1"></i>' + (id ? 'Lưu đơn hàng' : 'Tạo đơn hàng') + '</button>',
      onReady: function (body, close, el) {
        var tbody = el.querySelector('#lineBody');
        var priceById = {};
        products.forEach(function (p) { priceById[p.id] = p.price; });

        function lineRow(ln) {
          return '<tr class="line">' +
            '<td><select class="form-select form-select-sm" data-f="product">' +
              '<option value="">— Chọn sản phẩm —</option>' +
              products.map(function (p) {
                var name = p.name ? (p.name.length > 70 ? p.name.slice(0, 70) + '…' : p.name) : '';
                return '<option value="' + p.id + '"' +
                       (String(ln.product_id) === String(p.id) ? ' selected' : '') + '>' +
                       esc(name) + '</option>';
              }).join('') +
            '</select></td>' +
            '<td><input class="form-control form-control-sm text-end" data-f="qty" ' +
                       'inputmode="numeric" value="' + (ln.quantity || 1) + '"></td>' +
            '<td><input class="form-control form-control-sm text-end" data-f="price" ' +
                       'inputmode="numeric" value="' + (ln.unit_price || 0) + '"></td>' +
            '<td class="num fw-semibold" data-f="sub">0 ₫</td>' +
            '<td class="text-end"><button type="button" class="btn btn-sm btn-light border ' +
                'text-danger" data-rm aria-label="Xóa dòng"><i class="bi bi-x-lg"></i></button></td>' +
          '</tr>';
        }

        function draw() {
          tbody.innerHTML = lines.length
            ? lines.map(lineRow).join('')
            : '<tr><td colspan="5" class="text-center text-ink-3 py-3">' +
              'Chưa có dòng hàng nào — bấm "Thêm dòng" để bắt đầu</td></tr>';
          wire();
          recalc();
        }

        function wire() {
          Array.prototype.forEach.call(tbody.querySelectorAll('tr.line'), function (tr, i) {
            tr.querySelector('[data-f="product"]').addEventListener('change', function (e) {
              lines[i].product_id = e.target.value ? Number(e.target.value) : null;
              var priceEl = tr.querySelector('[data-f="price"]');
              if (lines[i].product_id && (!lines[i].unit_price || lines[i].touchedPrice !== true)) {
                lines[i].unit_price = priceById[lines[i].product_id] || 0;
                priceEl.value = lines[i].unit_price;
              }
              recalc();
            });
            tr.querySelector('[data-f="qty"]').addEventListener('input', function (e) {
              lines[i].quantity = digits(e.target.value);
              recalc();
            });
            tr.querySelector('[data-f="price"]').addEventListener('input', function (e) {
              lines[i].unit_price = digits(e.target.value);
              lines[i].touchedPrice = true;
              recalc();
            });
            tr.querySelector('[data-rm]').addEventListener('click', function () {
              lines.splice(i, 1);
              draw();
            });
          });
        }

        function recalc() {
          var total = 0;
          Array.prototype.forEach.call(tbody.querySelectorAll('tr.line'), function (tr, i) {
            var sub = (lines[i].quantity || 0) * (lines[i].unit_price || 0);
            total += sub;
            tr.querySelector('[data-f="sub"]').textContent = U.vnd(sub);
          });
          el.querySelector('#lineTotal').textContent = U.vnd(total);
          return total;
        }

        el.querySelector('#addLine').addEventListener('click', function () {
          lines.push({ product_id: null, quantity: 1, unit_price: 0 });
          draw();
          var last = tbody.querySelector('tr.line:last-child [data-f="product"]');
          if (last) last.focus();
        });

        el.querySelector('[data-save]').addEventListener('click', function () {
          saveOrder(el, id, lines, close);
        });

        draw();
      }
    });
  }

  function digits(v) { return Number(String(v).replace(/[^\d]/g, '')) || 0; }

  function toLocalInput(s) {
    var d = U.parseDT(s) || new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) +
           'T' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  }

  function fromLocalInput(v) {
    if (!v) return U.nowSQL();
    return String(v).replace('T', ' ') + (v.length === 16 ? ':00' : '');
  }

  async function saveOrder(el, id, lines, close) {
    var form = el.querySelector('#ordForm');

    if (!ui.validate(form, {
      user_id: [ui.RULE.required('Hãy chọn khách hàng cho đơn này.')],
      order_date: [ui.RULE.required('Hãy chọn ngày đặt hàng.')]
    })) return;

    var clean = lines.filter(function (l) { return l.product_id && l.quantity > 0; });
    if (!clean.length) {
      ui.toast('Đơn hàng phải có ít nhất một dòng hàng hợp lệ (đã chọn sản phẩm, số lượng > 0).', 'err');
      return;
    }

    var total = clean.reduce(function (s, l) { return s + l.quantity * l.unit_price; }, 0);
    var userId = Number(form.elements.user_id.value);
    var date = fromLocalInput(form.elements.order_date.value);
    var status = form.elements.status.value;

    try {
      var orderId = id;
      
      if (id) {
        var { error: orderErr } = await supabase.from('order').update({
          user_id: userId,
          order_date: date,
          status: status,
          total_amount: total
        }).eq('id', id);
        if (orderErr) throw orderErr;
        
        var { error: delErr } = await supabase.from('order_item').delete().eq('order_id', id);
        if (delErr) throw delErr;
      } else {
        var { data: newOrder, error: insErr } = await supabase.from('order').insert({
          user_id: userId,
          order_date: date,
          status: status,
          total_amount: total
        }).select('id').single();
        if (insErr) throw insErr;
        orderId = newOrder.id;
      }

      var itemsToInsert = clean.map(function(l) {
        return {
          order_id: orderId,
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          subtotal: l.quantity * l.unit_price
        };
      });

      var { error: insItemsErr } = await supabase.from('order_item').insert(itemsToInsert);
      if (insItemsErr) throw insItemsErr;

      Admin._lastOrderId = orderId;
      close();
      ui.toast(id ? 'Đã lưu đơn hàng #' + id + '.'
                  : 'Đã tạo đơn hàng #' + Admin._lastOrderId + '.', 'ok');
      Admin.reload();
    } catch (err) {
      ui.toast('Không lưu được đơn hàng: ' + err.message, 'err');
    }
  }

  /* ======================================================================
   * 6. XÓA ĐƠN
   * ====================================================================== */

  async function remove(id) {
    var { count, error } = await supabase.from('order_item').select('*', { count: 'exact', head: true }).eq('order_id', id);
    var n = count || 0;

    ui.confirm({
      title: 'Xóa đơn hàng #' + id + '?',
      rawMessage: 'Xóa vĩnh viễn đơn này cùng <strong>' + n + ' dòng hàng</strong> của nó. ' +
                  'Thao tác không hoàn tác được.<br><br>' +
                  '<span class="fs-13 text-ink-2">Nếu chỉ muốn ghi nhận đơn không thành công, ' +
                  'hãy đổi trạng thái sang <em>Đã hủy</em> để giữ lại lịch sử.</span>',
      okText: 'Xóa đơn hàng'
    }).then(async function (ok) {
      if (!ok) return;
      
      var { error: itemErr } = await supabase.from('order_item').delete().eq('order_id', id);
      if (itemErr) {
        ui.toast('Lỗi xóa dòng hàng: ' + itemErr.message, 'err');
        return;
      }
      
      var { error: orderErr } = await supabase.from('order').delete().eq('id', id);
      if (orderErr) {
        ui.toast('Lỗi xóa đơn hàng: ' + orderErr.message, 'err');
        return;
      }

      ui.toast('Đã xóa đơn hàng #' + id + '.', 'ok');
      Admin.reload();
    });
  }

  Admin.page('orders', {
    title: 'Đơn hàng',
    sub: 'Theo dõi và xử lý đơn của khách',
    icon: 'bi-receipt',
    badge: async function () {
      var { count, error } = await supabase.from('order').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      return count || 0;
    },
    render: render
  });
})(window.Admin);
