/* ==========================================================================
 * admin/js/page-dashboard.js — Mục "Tổng quan"
 *
 * Bốn khối, theo đúng thứ tự người quản lý cần nhìn:
 *   1. Bốn con số chốt      — tiền, đơn, hàng, khách
 *   2. Doanh thu theo tháng — xu hướng
 *   3. Đơn hàng             — cơ cấu trạng thái + đơn mới nhất
 *   4. Cần chú ý            — những việc phải xử lý ngay
 *
 * Mọi con số đều truy vấn qua Supabase.
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var U = Admin.util, esc = U.esc;

  /* ======================================================================
   * 1. GOM SỐ LIỆU
   * ====================================================================== */

  async function collect() {
    var s = {};

    var { data: oData } = await window.supabaseClient.from('order').select('id, status, total_amount');
    oData = oData || [];
    s.orders = oData.length;
    
    s.byStatus = {};
    var ordersOkCount = 0;
    var revenue = 0;
    oData.forEach(o => {
      s.byStatus[o.status] = (s.byStatus[o.status] || 0) + 1;
      if (o.status !== 'cancelled') {
        ordersOkCount++;
        revenue += (o.total_amount || 0);
      }
    });
    s.ordersOk = ordersOkCount;
    s.revenue = revenue;
    s.avg = s.ordersOk ? Math.round(s.revenue / s.ordersOk) : 0;

    var { data: pData } = await window.supabaseClient.from('product').select('id, in_stock, rating, description, image, category_id');
    pData = pData || [];
    s.products = pData.length;
    // in_stock có thể là 0/1 hoặc false/true
    s.outOfStock = pData.filter(p => p.in_stock == 0 || p.in_stock === false).length;
    s.noRating = pData.filter(p => p.rating == null).length;
    s.noDesc = pData.filter(p => !p.description || p.description.trim() === '').length;
    s.noImage = pData.filter(p => !p.image || p.image.trim() === '').length;
    
    var { data: catData } = await window.supabaseClient.from('category').select('id');
    var catIds = new Set((catData || []).map(c => c.id));
    s.categories = catIds.size;
    s.orphan = pData.filter(p => p.category_id && !catIds.has(p.category_id)).length + pData.filter(p => !p.category_id).length;

    var { data: profiles } = await window.supabaseClient.from('profiles').select('is_admin');
    s.customers = 0; s.admins = 0;
    (profiles || []).forEach(p => { 
      if (p.is_admin === 1 || p.is_admin === true) s.admins++; 
      else s.customers++; 
    });

    return s;
  }

  async function revenueSeries(months) {
    var { data: rows } = await window.supabaseClient.from('order')
      .select('order_date, total_amount')
      .neq('status', 'cancelled');
    rows = rows || [];

    var last = rows.reduce((max, r) => (r.order_date > max ? r.order_date : max), '');
    var end = last ? U.parseDT(last) : new Date();

    var sum = {}, cnt = {};
    rows.forEach(function (r) {
      var k = U.ym(r.order_date);
      sum[k] = (sum[k] || 0) + r.total_amount;
      cnt[k] = (cnt[k] || 0) + 1;
    });

    var out = [];
    for (var i = months - 1; i >= 0; i--) {
      var d = new Date(end.getFullYear(), end.getMonth() - i, 1);
      var key = d.getFullYear() + '-' + U.pad(d.getMonth() + 1);
      out.push({
        key: key,
        label: 'T' + (d.getMonth() + 1),
        full: 'Tháng ' + (d.getMonth() + 1) + '/' + d.getFullYear(),
        value: sum[key] || 0,
        count: cnt[key] || 0,
        extra: (cnt[key] || 0) + ' đơn'
      });
    }
    return out;
  }

  async function topProducts(limit) {
    var { data: orders } = await window.supabaseClient.from('order').select('id').neq('status', 'cancelled');
    if (!orders || !orders.length) return [];
    var orderIds = new Set(orders.map(o => o.id));

    var { data: items } = await window.supabaseClient.from('order_item').select('product_id, quantity, subtotal, order_id');
    items = (items || []).filter(oi => orderIds.has(oi.order_id));

    var pStats = {};
    items.forEach(oi => {
      var pid = oi.product_id;
      if (!pStats[pid]) pStats[pid] = { qty: 0, revenue: 0 };
      pStats[pid].qty += (oi.quantity || 0);
      pStats[pid].revenue += (oi.subtotal || 0);
    });

    var topPids = Object.keys(pStats)
      .sort((a, b) => pStats[b].revenue - pStats[a].revenue)
      .slice(0, limit);

    if (!topPids.length) return [];

    var { data: products } = await window.supabaseClient.from('product').select('id, name, image').in('id', topPids);
    var pMap = {};
    (products || []).forEach(p => { pMap[p.id] = p; });

    var result = topPids.map(pid => {
      var stat = pStats[pid];
      var p = pMap[pid] || { name: 'Sản phẩm ' + pid, image: null };
      return {
        id: pid,
        name: p.name,
        image: p.image,
        qty: stat.qty,
        revenue: stat.revenue
      };
    });

    return result;
  }

  async function recentOrders(limit) {
    var { data: orders } = await window.supabaseClient.from('order')
      .select('id, order_date, status, total_amount, user_id')
      .order('order_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
      
    if (!orders || !orders.length) return [];
    
    var userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))];
    var orderIds = orders.map(o => o.id);
    
    var { data: users } = await window.supabaseClient.from('profiles').select('id, fullname').in('id', userIds);
    var uMap = {};
    (users || []).forEach(u => { uMap[u.id] = u.fullname; });
    
    var { data: items } = await window.supabaseClient.from('order_item').select('order_id').in('order_id', orderIds);
    var iCount = {};
    (items || []).forEach(oi => {
      iCount[oi.order_id] = (iCount[oi.order_id] || 0) + 1;
    });

    return orders.map(o => ({
      id: o.id,
      order_date: o.order_date,
      status: o.status,
      total_amount: o.total_amount,
      fullname: uMap[o.user_id] || null,
      lines: iCount[o.id] || 0
    }));
  }

  /* ======================================================================
   * 2. CÁC MẢNH GIAO DIỆN
   * ====================================================================== */

  function tile(o) {
    return '<div class="col-6 col-xl-3">' +
      '<div class="card stat">' +
        '<span class="ico"><i class="bi ' + esc(o.icon) + '"></i></span>' +
        '<div class="min-w-0">' +
          '<div class="label">' + esc(o.label) + '</div>' +
          '<div class="' + (o.hero ? 'hero-figure' : 'value') + '">' + esc(o.value) + '</div>' +
          (o.hint ? '<div class="hint">' + esc(o.hint) + '</div>' : '') +
        '</div>' +
      '</div></div>';
  }

  function cardHead(title, right) {
    return '<div class="card-header">' +
             '<h2 class="h6 fw-bold mb-0">' + esc(title) + '</h2>' +
             '<div class="ms-auto d-flex gap-2 align-items-center">' + (right || '') + '</div>' +
           '</div>';
  }

  /* ======================================================================
   * 3. VẼ TRANG
   * ====================================================================== */

  async function render(view) {
    view.innerHTML = '<div class="p-5 text-center"><div class="spinner-border text-brand" role="status"></div></div>';

    try {
      var s = await collect();
      var series = await revenueSeries(6);
      var tops = await topProducts(5);
      var recent = await recentOrders(6);

      var lastLabel = series.length ? series[series.length - 1].full.toLowerCase() : '';

      view.innerHTML =
        /* --- Hàng 1: bốn con số chốt --- */
        '<div class="row g-3 mb-3">' +
          tile({
            icon: 'bi-cash-stack', label: 'Doanh thu ghi nhận',
            value: U.vnd(s.revenue), hero: true,
            hint: 'Không tính ' + (s.byStatus.cancelled || 0) + ' đơn đã hủy'
          }) +
          tile({
            icon: 'bi-receipt', label: 'Đơn hàng',
            value: U.num(s.orders),
            hint: 'Giá trị trung bình ' + U.vnd(s.avg)
          }) +
          tile({
            icon: 'bi-box-seam', label: 'Sản phẩm',
            value: U.num(s.products),
            hint: s.categories + ' danh mục · ' + s.outOfStock + ' hết hàng'
          }) +
          tile({
            icon: 'bi-people', label: 'Khách hàng',
            value: U.num(s.customers),
            hint: s.admins + ' tài khoản quản trị'
          }) +
        '</div>' +

        /* --- Hàng 2: xu hướng doanh thu + cơ cấu trạng thái --- */
        '<div class="row g-3 mb-3">' +
          '<div class="col-12 col-xl-8">' +
            '<div class="card h-100 viz-wrap" id="revWrap">' +
              cardHead('Doanh thu 6 tháng gần nhất',
                '<span class="fs-12 text-ink-3 d-none d-sm-inline">đến ' + esc(lastLabel) + '</span>' +
                '<button type="button" class="btn btn-sm btn-light border fs-12" ' +
                        'data-toggle-table aria-pressed="false">' +
                  '<i class="bi bi-table me-1"></i>Bảng số liệu</button>') +
              '<div class="card-body">' +
                '<div id="revChart"></div>' +
                '<div class="viz-table" id="revTable"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="col-12 col-xl-4">' +
            '<div class="card h-100">' +
              cardHead('Đơn hàng theo trạng thái') +
              '<div class="card-body"><div id="stChart"></div></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* --- Hàng 3: top sản phẩm + đơn mới nhất --- */
        '<div class="row g-3 mb-3">' +
          '<div class="col-12 col-xl-5">' +
            '<div class="card h-100">' +
              cardHead('Top 5 sản phẩm theo doanh thu') +
              '<div class="card-body pt-2"><div id="topChart"></div></div>' +
            '</div>' +
          '</div>' +
          '<div class="col-12 col-xl-7">' +
            '<div class="card h-100">' +
              cardHead('Đơn hàng gần đây',
                '<a class="btn btn-sm btn-light border fs-12" href="#/orders">' +
                  'Xem tất cả <i class="bi bi-arrow-right ms-1"></i></a>') +
              '<div class="table-responsive">' + recentTable(recent) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* --- Hàng 4: việc cần xử lý --- */
        '<div class="card">' +
          cardHead('Cần chú ý') +
          '<div class="card-body">' + attentionList(s) + '</div>' +
        '</div>';

      /* --- Gắn biểu đồ sau khi khung đã nằm trong DOM (cần đo bề rộng) --- */
      Admin.chart.columns(Admin.$('#revChart'), {
        data: series,
        height: 260,
        aria: 'Doanh thu 6 tháng gần nhất'
      });
      Admin.$('#revTable').innerHTML = Admin.chart.dataTable(
        series.map(function (d) {
          return { a: d.full + ' · ' + d.count + ' đơn', b: U.vnd(d.value) };
        }), 'Tháng', 'Doanh thu');
      Admin.chart.bindTableToggle(Admin.$('#revWrap'));

      Admin.chart.statusBars(Admin.$('#stChart'), s.byStatus);

      Admin.chart.hbars(Admin.$('#topChart'), tops.map(function (p) {
        return {
          name: p.name,
          value: p.revenue,
          valueText: U.vnd(p.revenue),
          extra: U.num(p.qty) + ' sản phẩm đã bán · ' + U.vnd(p.revenue)
        };
      }), { emptyText: 'Chưa có đơn hàng nào để thống kê' });
    } catch (err) {
      console.error(err);
      view.innerHTML = '<div class="p-4 text-danger">Lỗi tải dữ liệu: ' + esc(err.message) + '</div>';
    }
  }

  function recentTable(rows) {
    if (!rows.length) {
      return Admin.ui.emptyState('bi-receipt', 'Chưa có đơn hàng nào');
    }
    return '<table class="table table-hover align-middle mb-0">' +
      '<thead><tr>' +
        '<th>Mã đơn</th><th>Khách hàng</th><th>Ngày đặt</th>' +
        '<th class="num">Tổng tiền</th><th>Trạng thái</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (o) {
        return '<tr class="cursor-pointer" onclick="Admin.openOrder(' + o.id + ')">' +
          '<td class="fw-semibold text-brand">#' + o.id + '</td>' +
          '<td>' + esc(o.fullname || 'Khách vãng lai') +
            '<div class="fs-12 text-ink-3">' + o.lines + ' dòng hàng</div></td>' +
          '<td class="fs-13">' + esc(U.dateVN(o.order_date)) + '</td>' +
          '<td class="num fw-semibold">' + esc(U.vnd(o.total_amount)) + '</td>' +
          '<td>' + Admin.ui.statusBadge(o.status) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  /**
   * Danh sách việc cần xử lý. Chỉ hiện dòng nào thực sự có vấn đề; sạch hết
   * thì báo "không có gì phải xử lý" chứ không liệt kê một loạt số 0.
   */
  function attentionList(s) {
    var items = [];

    if (s.byStatus.pending) {
      items.push({
        tone: 'warning', icon: 'bi-hourglass-split',
        text: '<strong>' + s.byStatus.pending + ' đơn hàng</strong> đang chờ xử lý',
        href: '#/orders?status=pending', cta: 'Xử lý ngay'
      });
    }
    if (s.outOfStock) {
      items.push({
        tone: 'danger', icon: 'bi-x-octagon',
        text: '<strong>' + s.outOfStock + ' sản phẩm</strong> đang hết hàng',
        href: '#/products?stock=0', cta: 'Xem danh sách'
      });
    }
    if (s.orphan) {
      items.push({
        tone: 'danger', icon: 'bi-diagram-2',
        text: '<strong>' + s.orphan + ' sản phẩm</strong> trỏ vào danh mục không tồn tại',
        href: '#/products', cta: 'Gán lại danh mục'
      });
    }
    if (s.noImage) {
      items.push({
        tone: 'warning', icon: 'bi-image',
        text: '<strong>' + s.noImage + ' sản phẩm</strong> chưa có ảnh',
        href: '#/products', cta: 'Bổ sung ảnh'
      });
    }
    if (s.noDesc) {
      items.push({
        tone: 'info', icon: 'bi-card-text',
        text: '<strong>' + s.noDesc + ' sản phẩm</strong> chưa có mô tả',
        href: '#/products', cta: 'Viết mô tả'
      });
    }
    if (s.noRating) {
      items.push({
        tone: 'info', icon: 'bi-star',
        text: '<strong>' + s.noRating + ' sản phẩm</strong> chưa có đánh giá',
        href: '#/products?rating=none', cta: 'Xem danh sách'
      });
    }

    var unread = Admin.feedbackUnread ? Admin.feedbackUnread() : 0;
    if (unread) {
      items.push({
        tone: 'info', icon: 'bi-chat-left-dots',
        text: '<strong>' + unread + ' phản hồi</strong> từ khách chưa đọc',
        href: '#/feedback', cta: 'Đọc phản hồi'
      });
    }

    if (!items.length) {
      return Admin.ui.emptyState('bi-check2-circle', 'Không có việc nào cần xử lý',
        'Đơn hàng đã xử lý hết, kho hàng và dữ liệu sản phẩm đều đầy đủ.');
    }

    var tone = { warning: 'st-pending', danger: 'st-cancelled', info: 'st-paid' };
    return '<div class="d-flex flex-column gap-2">' + items.map(function (it) {
      return '<a href="' + it.href + '" class="d-flex align-items-center gap-3 p-2 rounded-3 ' +
             'text-decoration-none text-body border border-light-subtle bg-body-tertiary">' +
               '<i class="bi ' + it.icon + ' ' + tone[it.tone] + ' fs-5"></i>' +
               '<span class="fs-13 flex-grow-1">' + it.text + '</span>' +
               '<span class="fs-12 fw-semibold text-brand text-nowrap">' + esc(it.cta) +
                 ' <i class="bi bi-arrow-right"></i></span>' +
             '</a>';
    }).join('') + '</div>';
  }

  Admin.page('dashboard', {
    title: 'Tổng quan',
    label: 'Tổng quan',
    sub: 'Bức tranh chung của cửa hàng',
    icon: 'bi-speedometer2',
    render: render
  });
})(window.Admin);
