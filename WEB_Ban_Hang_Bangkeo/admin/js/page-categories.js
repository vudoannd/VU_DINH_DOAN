/* ==========================================================================
 * admin/js/page-categories.js — Mục "Danh mục"
 *
 * Bảng category chỉ có 3 cột (id, name, description) nên mục này gọn: xem,
 * thêm, sửa, xóa, kèm số sản phẩm và doanh thu của từng danh mục.
 *
 * Ràng buộc: không xóa danh mục còn sản phẩm. product.category_id là khóa
 * ngoại trỏ tới category.id; xóa danh mục sẽ để lại sản phẩm mồ côi, và
 * trang products.html bên website khách sẽ hiển thị chúng là "Khác".
 * Giao diện bắt chuyển sản phẩm sang danh mục khác trước rồi mới cho xóa.
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var U = Admin.util, esc = U.esc, ui = Admin.ui;
  var supabase = window.supabaseClient;

  /* Biểu tượng gợi ý cho 3 danh mục gốc — trùng với bộ icon trang chủ đang
     dùng, để nhìn qua là nhận ra ngay cùng một danh mục. */
  var ICONS = { 1: 'bi-file-earmark-text', 2: 'bi-record-circle', 3: 'bi-globe' };

  async function rows() {
    const [
      { data: categories },
      { data: products },
      { data: orderItems }
    ] = await Promise.all([
      supabase.from('category').select('*').order('id'),
      supabase.from('product').select('id, category_id, in_stock, price'),
      supabase.from('order_item').select('subtotal, product_id, order!inner(status)')
    ]);

    const cats = categories || [];
    const prods = products || [];
    const items = orderItems || [];

    return cats.map(function(c) {
      var cProds = prods.filter(function(p) { return p.category_id === c.id; });
      var productsCount = cProds.length;
      var oos = cProds.filter(function(p) { return p.in_stock === 0 || p.in_stock === false; }).length;
      var prices = cProds.map(function(p) { return p.price; });
      var price_min = prices.length ? Math.min.apply(null, prices) : 0;
      var price_max = prices.length ? Math.max.apply(null, prices) : 0;

      var cProdIds = {};
      cProds.forEach(function(p) { cProdIds[p.id] = true; });
      
      var revenue = 0;
      items.forEach(function(oi) {
        if (cProdIds[oi.product_id] && oi.order && oi.order.status !== 'cancelled') {
          revenue += oi.subtotal;
        }
      });

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        products: productsCount,
        oos: oos,
        price_min: price_min,
        price_max: price_max,
        revenue: revenue
      };
    });
  }

  async function render(view) {
    var list = await rows();
    
    var { data: orphansData } = await supabase.from('product').select('category_id');
    var { data: catData } = await supabase.from('category').select('id');
    var catIds = {};
    (catData || []).forEach(function(c) { catIds[c.id] = true; });
    var orphans = (orphansData || []).filter(function(p) { return !catIds[p.category_id]; }).length;

    view.innerHTML =
      (orphans
        ? '<div class="alert alert-warning border-0 border-start border-4 d-flex gap-3 align-items-center">' +
            '<i class="bi bi-exclamation-triangle fs-4"></i>' +
            '<div class="flex-grow-1 fs-13"><strong>' + orphans + ' sản phẩm</strong> đang trỏ ' +
              'vào một danh mục không còn tồn tại. Website khách sẽ xếp chúng vào nhóm "Khác".</div>' +
            '<a class="btn btn-sm btn-warning text-nowrap" href="#/products">Gán lại danh mục</a>' +
          '</div>'
        : '') +

      '<div class="row g-3 mb-3">' +
        list.map(function (c) {
          return '<div class="col-12 col-md-6 col-xl-4">' +
            '<div class="card h-100 p-3">' +
              '<div class="d-flex align-items-start gap-3">' +
                '<span class="ico d-grid" style="width:44px;height:44px;place-items:center;' +
                      'border-radius:.7rem;background:var(--brand-light);color:var(--brand);' +
                      'font-size:1.2rem;flex-shrink:0">' +
                  '<i class="bi ' + (ICONS[c.id] || 'bi-tag') + '"></i></span>' +
                '<div class="flex-grow-1 min-w-0">' +
                  '<h2 class="h6 fw-bold mb-1">' + esc(c.name) + '</h2>' +
                  '<p class="fs-12 text-ink-3 mb-0 clamp-2">' +
                    esc(c.description || 'Chưa có mô tả') + '</p>' +
                '</div>' +
              '</div>' +
              '<dl class="row row-cols-2 g-2 fs-12 mt-3 mb-2">' +
                cell('Sản phẩm', U.num(c.products) + (c.oos ? ' <span class="text-danger">(' +
                     c.oos + ' hết hàng)</span>' : '')) +
                cell('Doanh thu', U.vnd(c.revenue)) +
                cell('Giá thấp nhất', c.products ? U.vnd(c.price_min) : '—') +
                cell('Giá cao nhất', c.products ? U.vnd(c.price_max) : '—') +
              '</dl>' +
              '<div class="d-flex gap-2 mt-auto pt-2 border-top">' +
                '<a class="btn btn-sm btn-light border flex-grow-1" href="#/products?cat=' + c.id + '">' +
                  '<i class="bi bi-list-ul me-1"></i>Sản phẩm</a>' +
                '<button type="button" class="btn btn-sm btn-light border" data-edit="' + c.id +
                        '" aria-label="Sửa danh mục"><i class="bi bi-pencil"></i></button>' +
                '<button type="button" class="btn btn-sm btn-light border text-danger" data-del="' +
                        c.id + '" aria-label="Xóa danh mục"><i class="bi bi-trash"></i></button>' +
              '</div>' +
            '</div></div>';
        }).join('') +

        /* Ô "thêm mới" nằm cuối lưới, ngay chỗ mắt vừa lướt hết danh sách */
        '<div class="col-12 col-md-6 col-xl-4">' +
          '<button type="button" id="cAdd" class="card h-100 w-100 p-3 border-2 text-center ' +
                  'text-ink-3" style="border-style:dashed;min-height:170px">' +
            '<i class="bi bi-plus-circle d-block mb-2" style="font-size:1.8rem"></i>' +
            '<span class="fw-semibold">Thêm danh mục mới</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    view.querySelector('#cAdd').addEventListener('click', function () { openForm(null); });
    view.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openForm(Number(b.getAttribute('data-edit'))); });
    });
    view.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { remove(Number(b.getAttribute('data-del'))); });
    });
  }

  function cell(label, value) {
    return '<div class="col"><dt class="fw-normal text-ink-3">' + esc(label) + '</dt>' +
           '<dd class="fw-semibold mb-0">' + value + '</dd></div>';
  }

  /* ======================================================================
   * THÊM / SỬA
   * ====================================================================== */

  async function openForm(id) {
    var c;
    if (id) {
      var { data } = await supabase.from('category').select('*').eq('id', id).single();
      c = data;
    } else {
      c = { id: null, name: '', description: '' };
    }
    if (!c) return;

    ui.modal({
      title: id ? 'Sửa danh mục #' + id : 'Thêm danh mục mới',
      body:
        '<form id="catForm" novalidate>' +
          '<div class="mb-3">' +
            '<label class="form-label" for="c-name">Tên danh mục <span class="text-danger">*</span></label>' +
            '<input class="form-control" id="c-name" name="name" value="' + esc(c.name) + '" ' +
                   'placeholder="Ví dụ: Băng keo vải">' +
          '</div>' +
          '<div class="mb-0">' +
            '<label class="form-label" for="c-desc">Mô tả</label>' +
            '<textarea class="form-control" id="c-desc" name="description" rows="3" ' +
                      'placeholder="Một câu ngắn mô tả nhóm sản phẩm này">' +
              esc(c.description || '') + '</textarea>' +
            '<div class="form-text fs-12">Câu mô tả này hiện trên thẻ danh mục ở trang chủ.</div>' +
          '</div>' +
        '</form>',
      footer:
        '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Hủy</button>' +
        '<button type="button" class="btn btn-primary" data-save>' +
          '<i class="bi bi-check-lg me-1"></i>' + (id ? 'Lưu thay đổi' : 'Thêm danh mục') + '</button>',
      onReady: function (body, close, el) {
        el.querySelector('[data-save]').addEventListener('click', async function () {
          var form = el.querySelector('#catForm');
          if (!ui.validate(form, {
            name: [ui.RULE.minLen(2, 'Tên danh mục cần ít nhất 2 ký tự.')]
          })) return;

          var name = form.elements.name.value.trim();
          var desc = form.elements.description.value.trim() || null;

          // Tên trùng không bị CSDL chặn, nhưng hai danh mục cùng tên thì
          // bộ lọc bên website khách sẽ khó hiểu -> cảnh báo sớm ở đây.
          var { data: dup } = await supabase.from('category')
            .select('id')
            .ilike('name', name)
            .neq('id', id || 0)
            .limit(1)
            .maybeSingle();

          if (dup) {
            ui.setFieldError(form.elements.name, 'Đã có danh mục tên này (mã #' + dup.id + ').');
            return;
          }

          if (id) {
            await supabase.from('category').update({ name: name, description: desc }).eq('id', id);
          } else {
            await supabase.from('category').insert({ name: name, description: desc });
          }

          close();
          ui.toast(id ? 'Đã lưu danh mục.' : 'Đã thêm danh mục.', 'ok');
          Admin.reload();
        });
      }
    });
  }

  /* ======================================================================
   * XÓA — kèm bước chuyển sản phẩm sang danh mục khác
   * ====================================================================== */

  async function remove(id) {
    var { data: c } = await supabase.from('category').select('*').eq('id', id).single();
    if (!c) return;

    var { count: n } = await supabase.from('product').select('*', { count: 'exact', head: true }).eq('category_id', id);

    if (!n) {
      ui.confirm({
        title: 'Xóa danh mục?',
        rawMessage: 'Xóa danh mục <strong>' + esc(c.name) + '</strong>? Danh mục này chưa có ' +
                    'sản phẩm nào nên xóa an toàn.',
        okText: 'Xóa danh mục'
      }).then(async function (ok) {
        if (!ok) return;
        await supabase.from('category').delete().eq('id', id);
        ui.toast('Đã xóa danh mục.', 'ok');
        Admin.reload();
      });
      return;
    }

    var { data: othersData } = await supabase.from('category').select('id, name').neq('id', id).order('id');
    var others = othersData || [];

    ui.modal({
      title: 'Danh mục còn ' + n + ' sản phẩm',
      body:
        '<p class="mb-3">Danh mục <strong>' + esc(c.name) + '</strong> đang chứa ' +
          '<strong>' + n + ' sản phẩm</strong>. Hãy chọn nơi chuyển chúng tới trước khi xóa.</p>' +
        (others.length
          ? '<label class="form-label" for="moveTo">Chuyển toàn bộ sản phẩm sang</label>' +
            '<select class="form-select" id="moveTo">' +
              others.map(function (o) {
                return '<option value="' + o.id + '">' + esc(o.name) + '</option>';
              }).join('') +
            '</select>'
          : '<div class="alert alert-warning fs-13 mb-0">Đây là danh mục duy nhất còn lại. ' +
            'Hãy tạo một danh mục khác trước, rồi mới xóa được danh mục này.</div>'),
      footer:
        '<button type="button" class="btn btn-light border" data-bs-dismiss="modal">Hủy</button>' +
        (others.length
          ? '<button type="button" class="btn btn-danger" data-move>' +
            '<i class="bi bi-arrow-left-right me-1"></i>Chuyển rồi xóa</button>'
          : ''),
      onReady: function (body, close, el) {
        var btn = el.querySelector('[data-move]');
        if (!btn) return;
        btn.addEventListener('click', async function () {
          var to = Number(el.querySelector('#moveTo').value);
          // Một giao dịch: chuyển xong mới xóa.
          await supabase.from('product').update({ category_id: to }).eq('category_id', id);
          await supabase.from('category').delete().eq('id', id);
          
          close();
          ui.toast('Đã chuyển ' + n + ' sản phẩm và xóa danh mục.', 'ok');
          Admin.reload();
        });
      }
    });
  }

  Admin.page('categories', {
    title: 'Danh mục',
    sub: 'Nhóm sản phẩm hiển thị trên trang chủ',
    icon: 'bi-tags',
    render: render
  });
})(window.Admin);
