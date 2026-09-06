/* ==========================================================================
 * admin/js/page-products.js — Mục "Sản phẩm"
 *
 * Thêm / sửa / xóa sản phẩm, kèm tìm kiếm không dấu, lọc theo danh mục và
 * tình trạng kho, sắp xếp, phân trang, và thao tác hàng loạt.
 *
 * Ràng buộc quan trọng: KHÔNG cho xóa sản phẩm đã nằm trong đơn hàng nào.
 * Cột order_item.product_id là khóa ngoại trỏ tới product.id nhưng không có
 * ON DELETE, nên xóa đi sẽ để lại dòng hàng mồ côi — đơn cũ mất luôn tên sản
 * phẩm. Trường hợp đó giao diện gợi ý đánh dấu "hết hàng" thay vì xóa.
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var U = Admin.util, esc = U.esc, ui = Admin.ui;
  var supabase = window.supabaseClient;

  /* Trạng thái bộ lọc — giữ ngoài hàm render để chuyển mục rồi quay lại
     vẫn thấy đúng chỗ đang xem. */
  var state = { q: '', cat: 'all', stock: 'all', rating: 'all', sort: 'id-desc', page: 1, size: 12 };
  var picked = {};        // id các dòng đang tick chọn

  var SORTS = {
    'id-desc':    { label: 'Mới nhập trước' },
    'id-asc':     { label: 'Cũ nhất trước' },
    'name-asc':   { label: 'Tên A → Z' },
    'price-desc': { label: 'Giá cao → thấp' },
    'price-asc':  { label: 'Giá thấp → cao' },
    'rating-desc': { label: 'Đánh giá cao nhất' }
  };

  /* ======================================================================
   * 1. TRUY VẤN
   * ====================================================================== */

  async function categories() {
    var { data } = await supabase.from('category').select('id, name').order('id');
    return data || [];
  }

  /**
   * Lấy danh sách sản phẩm đã lọc.
   */
  async function fetchAll() {
    var query = supabase.from('product').select('*, category:category_id(name)');

    if (state.cat !== 'all') query = query.eq('category_id', Number(state.cat));
    if (state.stock !== 'all') query = query.eq('in_stock', Number(state.stock));
    if (state.rating === 'none') query = query.is('rating', null);
    if (state.rating === 'has') query = query.not('rating', 'is', null);

    if (state.sort === 'id-desc') query = query.order('id', { ascending: false });
    else if (state.sort === 'id-asc') query = query.order('id', { ascending: true });
    else if (state.sort === 'name-asc') query = query.order('name', { ascending: true });
    else if (state.sort === 'price-desc') query = query.order('price', { ascending: false });
    else if (state.sort === 'price-asc') query = query.order('price', { ascending: true });
    else if (state.sort === 'rating-desc') query = query.order('rating', { ascending: false, nullsFirst: false });

    var { data } = await query;
    var rows = data || [];

    for (var i = 0; i < rows.length; i++) {
      var p = rows[i];
      if (p.category) p.category_name = p.category.name;
      
      var { count } = await supabase.from('order_item')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', p.id);
      p.order_lines = count || 0;
    }

    if (state.q) {
      var key = U.deaccent(state.q);
      rows = rows.filter(function (p) {
        return U.deaccent(p.name).indexOf(key) !== -1 ||
               U.deaccent(p.category_name || '').indexOf(key) !== -1 ||
               String(p.id) === state.q.trim();
      });
    }
    return rows;
  }

  async function knownImages() {
    var { data } = await supabase.from('product').select('image').not('image', 'is', null).neq('image', '');
    if (!data) return [];
    var images = data.map(function (r) { return r.image; });
    return images.filter(function(v, i, a) { return a.indexOf(v) === i; }).sort();
  }

  /* ======================================================================
   * 2. VẼ TRANG
   * ====================================================================== */

  async function render(view) {
    // Nhận bộ lọc gửi kèm từ trang tổng quan: #/products?stock=0
    var q = Admin.query();
    if (q.stock !== undefined) { state.stock = q.stock; state.page = 1; }
    if (q.cat !== undefined) { state.cat = q.cat; state.page = 1; }
    if (q.rating !== undefined) { state.rating = q.rating; state.page = 1; }

    var cats = await categories();
    var rows = await fetchAll();
    var pages = Math.max(1, Math.ceil(rows.length / state.size));
    if (state.page > pages) state.page = pages;
    var slice = rows.slice((state.page - 1) * state.size, state.page * state.size);

    view.innerHTML =
      '<div class="card">' +
        '<div class="card-header">' +
          '<div class="d-flex flex-wrap gap-2 align-items-center w-100">' +

            '<div class="position-relative flex-grow-1" style="min-width:220px;max-width:340px">' +
              '<i class="bi bi-search position-absolute text-ink-3" ' +
                 'style="left:.75rem;top:50%;transform:translateY(-50%)"></i>' +
              '<input type="search" class="form-control ps-5" id="pSearch" ' +
                     'placeholder="Tìm theo tên hoặc mã (gõ không dấu cũng ra)" ' +
                     'value="' + esc(state.q) + '" aria-label="Tìm sản phẩm">' +
            '</div>' +

            '<select class="form-select w-auto" id="pCat" aria-label="Lọc theo danh mục">' +
              '<option value="all">Mọi danh mục</option>' +
              cats.map(function (c) {
                return '<option value="' + c.id + '"' +
                       (state.cat === String(c.id) ? ' selected' : '') + '>' +
                       esc(c.name) + '</option>';
              }).join('') +
            '</select>' +

            '<select class="form-select w-auto" id="pStock" aria-label="Lọc theo tình trạng kho">' +
              '<option value="all">Mọi tình trạng</option>' +
              '<option value="1"' + (state.stock === '1' ? ' selected' : '') + '>Còn hàng</option>' +
              '<option value="0"' + (state.stock === '0' ? ' selected' : '') + '>Hết hàng</option>' +
            '</select>' +

            '<select class="form-select w-auto" id="pSort" aria-label="Sắp xếp">' +
              Object.keys(SORTS).map(function (k) {
                return '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>' +
                       esc(SORTS[k].label) + '</option>';
              }).join('') +
            '</select>' +

            '<div class="ms-auto d-flex gap-2">' +
              (state.rating !== 'all' || state.stock !== 'all' || state.cat !== 'all' || state.q
                ? '<button type="button" class="btn btn-light border" id="pReset">' +
                  '<i class="bi bi-x-circle me-1"></i>Bỏ lọc</button>' : '') +
              '<button type="button" class="btn btn-primary" id="pAdd">' +
                '<i class="bi bi-plus-lg me-1"></i>Thêm sản phẩm</button>' +
            '</div>' +

          '</div>' +
        '</div>' +

        '<div id="pBulk" class="px-3 py-2 border-bottom bg-brand-lighter d-none">' +
          '<div class="d-flex flex-wrap align-items-center gap-2 fs-13">' +
            '<span id="pBulkCount" class="fw-semibold"></span>' +
            '<button type="button" class="btn btn-sm btn-light border" data-bulk="1">' +
              '<i class="bi bi-check-circle me-1"></i>Đánh dấu còn hàng</button>' +
            '<button type="button" class="btn btn-sm btn-light border" data-bulk="0">' +
              '<i class="bi bi-x-circle me-1"></i>Đánh dấu hết hàng</button>' +
            '<button type="button" class="btn btn-sm btn-outline-danger" data-bulk="del">' +
              '<i class="bi bi-trash me-1"></i>Xóa</button>' +
            '<button type="button" class="btn btn-sm btn-link text-decoration-none ms-auto" ' +
                    'data-bulk="none">Bỏ chọn</button>' +
          '</div>' +
        '</div>' +

        '<div class="table-responsive">' + table(slice) + '</div>' +

        '<div class="card-header border-top border-bottom-0 d-flex flex-wrap gap-2">' +
          '<span class="fs-13 text-ink-2">' +
            ui.rangeText(rows.length, state.page, state.size, 'sản phẩm') + '</span>' +
          '<div class="ms-auto" id="pPager">' + ui.pager(rows.length, state.page, state.size) + '</div>' +
        '</div>' +
      '</div>';

    bind(view, rows);
  }

  function table(rows) {
    if (!rows.length) {
      return ui.emptyState('bi-box-seam', 'Không tìm thấy sản phẩm nào',
        'Thử đổi từ khóa hoặc bỏ bớt bộ lọc.');
    }

    return '<table class="table table-hover align-middle mb-0">' +
      '<thead><tr>' +
        '<th style="width:36px"><input type="checkbox" class="form-check-input" id="pAllChk" ' +
            'aria-label="Chọn tất cả"></th>' +
        '<th style="width:64px">Ảnh</th>' +
        '<th>Sản phẩm</th>' +
        '<th>Danh mục</th>' +
        '<th class="num">Giá</th>' +
        '<th>Đặt tối thiểu</th>' +
        '<th class="num">Đánh giá</th>' +
        '<th>Kho</th>' +
        '<th style="width:96px" class="text-end">Thao tác</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr data-id="' + p.id + '">' +
          '<td><input type="checkbox" class="form-check-input" data-pick="' + p.id + '"' +
             (picked[p.id] ? ' checked' : '') + ' aria-label="Chọn sản phẩm ' + p.id + '"></td>' +
          '<td>' + U.imgTag(p.image, 'thumb', p.name) + '</td>' +
          '<td style="min-width:260px;max-width:420px">' +
            '<div class="clamp-2 fw-semibold fs-13" title="' + esc(p.name) + '">' +
              esc(p.name) + '</div>' +
            '<div class="fs-12 text-ink-3">Mã #' + p.id +
              (p.order_lines ? ' · đã bán trong ' + p.order_lines + ' đơn' : '') + '</div>' +
          '</td>' +
          '<td class="fs-13">' + (p.category_name
              ? esc(p.category_name)
              : '<span class="badge bg-danger-subtle text-danger-emphasis">Danh mục lỗi</span>') +
          '</td>' +
          '<td class="num fw-semibold">' + esc(U.vnd(p.price)) + '</td>' +
          '<td class="fs-13 text-ink-2">' + esc(p.moq || '—') + '</td>' +
          '<td class="num fs-13">' + (p.rating === null
              ? '<span class="text-ink-3">—</span>'
              : '<i class="bi bi-star-fill text-warning me-1"></i>' + p.rating.toFixed(1)) + '</td>' +
          '<td>' + (p.in_stock
              ? '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle">Còn hàng</span>'
              : '<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle">Hết hàng</span>') +
          '</td>' +
          '<td class="text-end text-nowrap">' +
            '<button type="button" class="btn btn-sm btn-light border" data-edit="' + p.id +
                   '" title="Sửa" aria-label="Sửa sản phẩm"><i class="bi bi-pencil"></i></button> ' +
            '<button type="button" class="btn btn-sm btn-light border text-danger" data-del="' + p.id +
                   '" title="Xóa" aria-label="Xóa sản phẩm"><i class="bi bi-trash"></i></button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  /* ======================================================================
   * 3. GẮN SỰ KIỆN
   * ====================================================================== */

  function bind(view, rows) {
    var $ = function (s) { return view.querySelector(s); };

    $('#pSearch').addEventListener('input', U.debounce(function (e) {
      state.q = e.target.value;
      state.page = 1;
      Admin.reload();
      // Trả con trỏ về ô tìm kiếm sau khi vẽ lại, để gõ tiếp không bị ngắt
      var box = document.querySelector('#pSearch');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }, 280));

    $('#pCat').addEventListener('change', function (e) { setFilter('cat', e.target.value); });
    $('#pStock').addEventListener('change', function (e) { setFilter('stock', e.target.value); });
    $('#pSort').addEventListener('change', function (e) {
      state.sort = e.target.value; Admin.reload();
    });

    var reset = $('#pReset');
    if (reset) reset.addEventListener('click', function () {
      state.q = ''; state.cat = 'all'; state.stock = 'all'; state.rating = 'all'; state.page = 1;
      clearQuery();
      Admin.reload();
    });

    $('#pAdd').addEventListener('click', function () { openForm(null); });

    // --- Chọn dòng ---
    var allChk = $('#pAllChk');
    if (allChk) allChk.addEventListener('change', function () {
      rows.slice((state.page - 1) * state.size, state.page * state.size).forEach(function (p) {
        if (allChk.checked) picked[p.id] = true; else delete picked[p.id];
      });
      view.querySelectorAll('[data-pick]').forEach(function (c) { c.checked = allChk.checked; });
      syncBulk(view);
    });

    view.querySelectorAll('[data-pick]').forEach(function (c) {
      c.addEventListener('change', function () {
        var id = c.getAttribute('data-pick');
        if (c.checked) picked[id] = true; else delete picked[id];
        syncBulk(view);
      });
    });

    view.querySelectorAll('[data-bulk]').forEach(function (b) {
      b.addEventListener('click', function () { bulk(b.getAttribute('data-bulk')); });
    });

    // --- Sửa / xóa ---
    view.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openForm(Number(b.getAttribute('data-edit'))); });
    });
    view.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { remove(Number(b.getAttribute('data-del'))); });
    });

    // --- Phân trang ---
    var pager = $('#pPager');
    if (pager) pager.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-page]');
      if (!btn) return;
      state.page = Number(btn.getAttribute('data-page'));
      Admin.reload();
    });

    syncBulk(view);
  }

  function setFilter(key, value) {
    state[key] = value;
    state.page = 1;
    clearQuery();
    Admin.reload();
  }

  /** Xóa tham số lọc trên hash để lần vẽ sau không bị nó ghi đè trở lại. */
  function clearQuery() {
    if (location.hash.indexOf('?') !== -1) {
      history.replaceState(null, '', location.pathname + '#/products');
    }
  }

  function syncBulk(view) {
    var ids = Object.keys(picked);
    var bar = view.querySelector('#pBulk');
    if (!bar) return;
    bar.classList.toggle('d-none', ids.length === 0);
    var label = view.querySelector('#pBulkCount');
    if (label) label.textContent = 'Đã chọn ' + ids.length + ' sản phẩm';
  }

  /* ======================================================================
   * 4. THAO TÁC HÀNG LOẠT
   * ====================================================================== */

  async function bulk(action) {
    var ids = Object.keys(picked).map(Number);
    if (!ids.length) return;

    if (action === 'none') { picked = {}; Admin.reload(); return; }

    if (action === '0' || action === '1') {
      for (var i = 0; i < ids.length; i++) {
        await supabase.from('product').update({ in_stock: Number(action) }).eq('id', ids[i]);
      }
      picked = {};
      ui.toast('Đã cập nhật tình trạng kho cho ' + ids.length + ' sản phẩm.', 'ok');
      Admin.reload();
      return;
    }

    if (action === 'del') {
      var locked = [];
      for (var j = 0; j < ids.length; j++) {
        var id = ids[j];
        var { count } = await supabase.from('order_item').select('*', { count: 'exact', head: true }).eq('product_id', id);
        if (count > 0) locked.push(id);
      }
      
      var free = ids.filter(function (id) { return locked.indexOf(id) === -1; });

      if (!free.length) {
        ui.toast('Tất cả sản phẩm đã chọn đều nằm trong đơn hàng nên không xóa được.', 'err');
        return;
      }

      ui.confirm({
        title: 'Xóa ' + free.length + ' sản phẩm?',
        rawMessage:
          'Thao tác này không hoàn tác được.' +
          (locked.length
            ? '<br><br><span class="badge bg-warning-subtle text-warning-emphasis">Bỏ qua ' +
              locked.length + ' sản phẩm</span> vì đang nằm trong đơn hàng đã ghi nhận.'
            : ''),
        okText: 'Xóa ' + free.length + ' sản phẩm'
      }).then(async function (ok) {
        if (!ok) return;
        for (var k = 0; k < free.length; k++) {
          await supabase.from('product').delete().eq('id', free[k]);
        }
        picked = {};
        ui.toast('Đã xóa ' + free.length + ' sản phẩm.', 'ok');
        Admin.reload();
      });
    }
  }

  /* ======================================================================
   * 5. XÓA MỘT SẢN PHẨM
   * ====================================================================== */

  async function remove(id) {
    var { data: p } = await supabase.from('product').select('name').eq('id', id).single();
    if (!p) return;

    var { count: used } = await supabase.from('order_item').select('*', { count: 'exact', head: true }).eq('product_id', id);
    if (used > 0) {
      ui.modal({
        title: 'Không thể xóa sản phẩm này',
        body:
          '<p class="mb-2">Sản phẩm <strong>' + esc(p.name) + '</strong> đã xuất hiện trong ' +
          '<strong>' + used + ' dòng hàng</strong> của các đơn đã ghi nhận.</p>' +
          '<p class="fs-13 text-ink-2 mb-0">Xóa đi thì những đơn hàng cũ sẽ mất tên sản phẩm ' +
          'và không còn tra cứu được. Nếu muốn ngừng bán, hãy đánh dấu <em>hết hàng</em> — ' +
          'sản phẩm sẽ biến mất khỏi phần giới thiệu nhưng lịch sử đơn hàng vẫn nguyên vẹn.</p>',
        footer:
          '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Đóng</button>' +
          '<button type="button" class="btn btn-primary" data-oos>' +
            '<i class="bi bi-x-circle me-1"></i>Đánh dấu hết hàng</button>',
        onReady: function (body, close, el) {
          el.querySelector('[data-oos]').addEventListener('click', async function () {
            await supabase.from('product').update({ in_stock: 0 }).eq('id', id);
            close();
            ui.toast('Đã đánh dấu "' + p.name.slice(0, 40) + '…" là hết hàng.', 'ok');
            Admin.reload();
          });
        }
      });
      return;
    }

    ui.confirm({
      title: 'Xóa sản phẩm?',
      rawMessage: 'Xóa vĩnh viễn <strong>' + esc(p.name) + '</strong>? Thao tác này không hoàn tác được.',
      okText: 'Xóa sản phẩm'
    }).then(async function (ok) {
      if (!ok) return;
      await supabase.from('product').delete().eq('id', id);
      delete picked[id];
      ui.toast('Đã xóa sản phẩm.', 'ok');
      Admin.reload();
    });
  }

  /* ======================================================================
   * 6. BIỂU MẪU THÊM / SỬA
   * ====================================================================== */

  async function openForm(id) {
    var p;
    if (id) {
      var { data } = await supabase.from('product').select('*').eq('id', id).single();
      p = data;
    } else {
      p = { id: null, category_id: null, name: '', description: '', price: '', image: '',
            in_stock: 1, moq: '', rating: null };
    }
    if (!p) { ui.toast('Không tìm thấy sản phẩm.', 'err'); return; }

    var specs = { text: p.description || '', thickness: p.thickness || '', weight: p.weight || '', length: p.length || '', adhesion: p.adhesion || '', application: p.application || '' };

    var cats = await categories();
    var imgs = await knownImages();

    ui.modal({
      title: id ? 'Sửa sản phẩm #' + id : 'Thêm sản phẩm mới',
      size: 'lg',
      body:
        '<form id="prodForm" novalidate>' +
          '<div class="row g-3">' +

            '<div class="col-12">' +
              '<label class="form-label" for="f-name">Tên sản phẩm <span class="text-danger">*</span></label>' +
              '<textarea class="form-control" id="f-name" name="name" rows="2" ' +
                        'placeholder="Ví dụ: Băng keo trong 48mm x 100 yard">' + esc(p.name) + '</textarea>' +
            '</div>' +

            '<div class="col-md-6">' +
              '<label class="form-label" for="f-cat">Danh mục <span class="text-danger">*</span></label>' +
              '<select class="form-select" id="f-cat" name="category_id">' +
                '<option value="">— Chọn danh mục —</option>' +
                cats.map(function (c) {
                  return '<option value="' + c.id + '"' +
                         (String(p.category_id) === String(c.id) ? ' selected' : '') + '>' +
                         esc(c.name) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +

            '<div class="col-md-6">' +
              '<label class="form-label" for="f-price">Giá bán (đồng) <span class="text-danger">*</span></label>' +
              '<div class="input-group">' +
                '<input class="form-control" id="f-price" name="price" inputmode="numeric" ' +
                       'value="' + esc(p.price === '' ? '' : p.price) + '">' +
                '<span class="input-group-text" id="pricePreview">₫</span>' +
              '</div>' +
              '<div class="form-text fs-12">Nhập số nguyên, đơn vị đồng. CSDL lưu kiểu INTEGER ' +
                'để cộng tiền đơn hàng không bị sai số lẻ.</div>' +
            '</div>' +

            '<div class="col-md-6">' +
              '<label class="form-label" for="f-moq">Đặt hàng tối thiểu</label>' +
              '<input class="form-control" id="f-moq" name="moq" placeholder="Ví dụ: 10 Cuộn" ' +
                     'value="' + esc(p.moq || '') + '">' +
            '</div>' +

            '<div class="col-md-3">' +
              '<label class="form-label" for="f-rating">Đánh giá (0–5)</label>' +
              '<input class="form-control" id="f-rating" name="rating" inputmode="decimal" ' +
                     'placeholder="Để trống" value="' +
                     (p.rating === null || p.rating === undefined ? '' : p.rating) + '">' +
              '<div class="form-text fs-12">Trống = chưa có đánh giá</div>' +
            '</div>' +

            '<div class="col-md-3">' +
              '<label class="form-label d-block">Tình trạng kho</label>' +
              '<div class="form-check form-switch mt-2">' +
                '<input class="form-check-input" type="checkbox" role="switch" id="f-stock" ' +
                       'name="in_stock"' + (Number(p.in_stock) ? ' checked' : '') + '>' +
                '<label class="form-check-label fs-13" for="f-stock" id="stockLabel">' +
                  (Number(p.in_stock) ? 'Còn hàng' : 'Hết hàng') + '</label>' +
              '</div>' +
            '</div>' +

            '<div class="col-12">' +
              '<label class="form-label" for="f-desc">Mô tả chung</label>' +
              '<textarea class="form-control" id="f-desc" name="text" rows="3" ' +
                        'placeholder="Chất liệu, tính năng chung...">' +
                esc(specs.text) + '</textarea>' +
            '</div>' +

            '<div class="col-12"><div class="fw-semibold fs-14 mt-2 mb-1 text-brand border-bottom pb-1">Thông số kỹ thuật chi tiết</div></div>' +

            '<div class="col-md-4 col-sm-6">' +
              '<label class="form-label fs-13" for="f-thickness">Độ dày màng (mic)</label>' +
              '<input class="form-control form-control-sm" id="f-thickness" name="thickness" ' +
                     'placeholder="VD: 50 mic" value="' + esc(specs.thickness) + '">' +
            '</div>' +

            '<div class="col-md-4 col-sm-6">' +
              '<label class="form-label fs-13" for="f-weight">Trọng lượng (kg/cây)</label>' +
              '<input class="form-control form-control-sm" id="f-weight" name="weight" ' +
                     'placeholder="VD: 1.2 kg/cây" value="' + esc(specs.weight) + '">' +
            '</div>' +

            '<div class="col-md-4 col-sm-6">' +
              '<label class="form-label fs-13" for="f-length">Chiều dài (yard)</label>' +
              '<input class="form-control form-control-sm" id="f-length" name="length" ' +
                     'placeholder="VD: 100 yard" value="' + esc(specs.length) + '">' +
            '</div>' +

            '<div class="col-md-6">' +
              '<label class="form-label fs-13" for="f-adhesion">Độ bám dính</label>' +
              '<input class="form-control form-control-sm" id="f-adhesion" name="adhesion" ' +
                     'placeholder="VD: Cao, siêu dính..." value="' + esc(specs.adhesion) + '">' +
            '</div>' +

            '<div class="col-md-6">' +
              '<label class="form-label fs-13" for="f-application">Ứng dụng</label>' +
              '<input class="form-control form-control-sm" id="f-application" name="application" ' +
                     'placeholder="VD: Dán thùng carton..." value="' + esc(specs.application) + '">' +
            '</div>' +

            '<div class="col-12 mt-4">' +
              '<label class="form-label" for="f-img">Ảnh sản phẩm</label>' +
              '<div class="d-flex gap-3 align-items-start flex-wrap">' +
                '<div class="text-center">' +
                  U.imgTag(p.image, 'thumb', p.name).replace('class="thumb"',
                    'class="thumb" id="imgPreview" style="width:82px;height:82px"') +
                  '<div class="fs-12 text-ink-3 mt-1">Xem trước</div>' +
                '</div>' +
                '<div class="flex-grow-1" style="min-width:240px">' +
                  '<input class="form-control mb-2" id="f-img" name="image" ' +
                         'placeholder="ten_file.webp" value="' + esc(p.image || '') + '">' +
                  '<div class="form-text fs-12 mb-2">Chỉ nhập TÊN FILE. Ảnh phải nằm sẵn trong ' +
                    'thư mục <code>images/products/</code> — trình duyệt không có quyền tự chép ' +
                    'file vào đó, phải chép tay.</div>' +
              '<div class="col-12 mt-3">' +
                '<label class="form-label" for="f-gallery">Thư viện ảnh (Gallery Carousel)</label>' +
                '<textarea class="form-control" id="f-gallery" name="gallery" rows="2" ' +
                          'placeholder="[\'anh1.jpg\', \'anh2.jpg\']">' + 
                          esc(typeof p.gallery === 'string' ? p.gallery : (Array.isArray(p.gallery) ? JSON.stringify(p.gallery) : '')) + '</textarea>' +
                '<div class="form-text fs-12">Nhập mảng JSON ví dụ: <code>["anh1.jpg", "anh2.jpg"]</code> để hiển thị Carousel.</div>' +
              '</div>' +

                  (imgs.length
                    ? '<div class="img-pick">' + imgs.map(function (f) {
                        return '<button type="button" data-img="' + esc(f) + '" ' +
                               'aria-pressed="' + (f === p.image) + '" title="' + esc(f) + '">' +
                               '<img src="' + esc(U.IMG_DIR + encodeURIComponent(f).replace(/\.(png|jpg|jpeg)$/i, '.webp')) + '" alt="" ' +
                               'loading="lazy"></button>';
                      }).join('') + '</div>'
                    : '') +
                '</div>' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</form>',
      footer:
        '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Hủy</button>' +
        '<button type="button" class="btn btn-primary" data-save>' +
          '<i class="bi bi-check-lg me-1"></i>' + (id ? 'Lưu thay đổi' : 'Thêm sản phẩm') + '</button>',
      onReady: function (body, close, el) {
        var form = el.querySelector('#prodForm');

        // Xem trước giá đã định dạng ngay khi gõ
        var priceInput = form.elements.price;
        var preview = el.querySelector('#pricePreview');
        function syncPrice() {
          var n = Number(String(priceInput.value).replace(/[^\d]/g, ''));
          preview.textContent = n > 0 ? U.vnd(n) : '₫';
        }
        priceInput.addEventListener('input', syncPrice);
        syncPrice();

        // Nhãn công tắc đổi theo trạng thái
        form.elements.in_stock.addEventListener('change', function (e) {
          el.querySelector('#stockLabel').textContent = e.target.checked ? 'Còn hàng' : 'Hết hàng';
        });

        // Chọn ảnh từ bảng gợi ý
        var imgInput = form.elements.image;
        var imgPrev = el.querySelector('#imgPreview');
        function syncImg() {
          var f = imgInput.value.trim();
          imgPrev.src = f ? U.IMG_DIR + encodeURIComponent(f).replace(/\.(png|jpg|jpeg)$/i, '.webp') : U.FALLBACK_IMG;
          el.querySelectorAll('[data-img]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.getAttribute('data-img') === f));
          });
        }
        imgInput.addEventListener('input', syncImg);
        el.querySelectorAll('[data-img]').forEach(function (b) {
          b.addEventListener('click', function () {
            imgInput.value = b.getAttribute('data-img');
            syncImg();
          });
        });

        el.querySelector('[data-save]').addEventListener('click', function () {
          save(form, id, close);
        });
      }
    });
  }

  async function save(form, id, close) {
    var R = ui.RULE;
    var ok = ui.validate(form, {
      name: [R.minLen(5, 'Tên sản phẩm cần ít nhất 5 ký tự.')],
      category_id: [R.required('Hãy chọn danh mục cho sản phẩm.')],
      price: [R.intRange(0, 1000000000, 'Giá phải là số nguyên từ 0 đến 1.000.000.000 đồng.')],
      rating: [{
        test: function (v) {
          if (String(v).trim() === '') return true;         // trống = chưa đánh giá
          var n = Number(String(v).replace(',', '.'));
          return isFinite(n) && n >= 0 && n <= 5;
        },
        msg: 'Đánh giá phải nằm trong khoảng 0 đến 5, hoặc để trống.'
      }]
    });
    if (!ok) return;

    var rating = String(form.elements.rating.value).trim();
    
    var specsObj = {
      text: form.querySelector('[name="text"]').value.trim(),
      thickness: form.querySelector('[name="thickness"]').value.trim(),
      weight: form.querySelector('[name="weight"]').value.trim(),
      length: form.querySelector('[name="length"]').value.trim(),
      adhesion: form.querySelector('[name="adhesion"]').value.trim(),
      application: form.querySelector('[name="application"]').value.trim()
    };

    var data = {
      category_id: Number(form.elements.category_id.value),
      name: form.querySelector('[name="name"]').value.trim(),
      description: form.querySelector('[name="text"]').value.trim() || null,
      thickness: form.querySelector('[name="thickness"]').value.trim() || null,
      weight: form.querySelector('[name="weight"]').value.trim() || null,
      length: form.querySelector('[name="length"]').value.trim() || null,
      adhesion: form.querySelector('[name="adhesion"]').value.trim() || null,
      application: form.querySelector('[name="application"]').value.trim() || null,
      price: Number(String(form.elements.price.value).replace(/[^\d]/g, '')),
      image: form.elements.image.value.trim() || null,
        gallery: (function() {
          var val = form.elements.gallery.value.trim();
          if (!val) return null;
          try {
             if (val.startsWith('[')) return val;
             return JSON.stringify(val.split(',').map(s => s.trim()));
          } catch(e) { return val; }
        })(),

      in_stock: form.elements.in_stock.checked ? 1 : 0,
      moq: form.elements.moq.value.trim() || null,
      rating: rating === '' ? null : Number(rating.replace(',', '.'))
    };

    try {
      if (id) {
        var { error } = await supabase.from('product').update(data).eq('id', id);
        if (error) throw error;
        ui.toast('Đã lưu thay đổi.', 'ok');
      } else {
        var { data: inserted, error: insertError } = await supabase.from('product').insert([data]).select();
        if (insertError) throw insertError;
        ui.toast('Đã thêm sản phẩm #' + (inserted && inserted[0] ? inserted[0].id : '') + '.', 'ok');
      }
      close();
      Admin.reload();
    } catch (err) {
      ui.toast('Không lưu được: ' + err.message, 'err');
    }
  }

  Admin.page('products', {
    title: 'Sản phẩm',
    sub: 'Thêm, sửa, xóa và quản lý kho hàng',
    icon: 'bi-box-seam',
    badge: async function () { 
      var { count } = await supabase.from('product').select('*', { count: 'exact', head: true }).eq('in_stock', 0);
      return count || 0;
    },
    render: render
  });
})(window.Admin);
