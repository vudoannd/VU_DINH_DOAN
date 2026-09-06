/* ==========================================================================
 * admin/js/chart.js — Biểu đồ cho trang tổng quan
 *
 * Vẽ bằng SVG dựng tay trong JavaScript, KHÔNG nạp thêm thư viện biểu đồ nào
 * (không Chart.js, không D3). Lý do: dự án chốt đúng 3 thư viện CDN
 * (Bootstrap, Bootstrap Icons, sql.js) và mấy biểu đồ ở đây đủ đơn giản để
 * tự vẽ, thêm một thư viện nữa là thêm ~200KB cho vài chục dòng hình.
 *
 * Quy ước hình học áp dụng cho mọi biểu đồ trong file này:
 *   - Một chuỗi số liệu duy nhất -> dùng thẳng màu thương hiệu, không cần
 *     chú giải (tiêu đề thẻ đã nói rõ đang đo gì).
 *   - Cột dày tối đa 24px, bo 4px ở ĐẦU cột, vuông ở CHÂN cột vì chân cột
 *     dính vào mốc 0.
 *   - Lưới kẻ mảnh 1px, màu nhạt hơn nền một bậc, không kẻ nét đứt.
 *   - Chữ không bao giờ mang màu dữ liệu; nhãn và số đều dùng màu chữ thường.
 *   - Mỗi biểu đồ đều có nút "Bảng số liệu" để đọc bằng bảng — cần cho người
 *     dùng trình đọc màn hình và cho người không phân biệt được màu.
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var esc = Admin.util.esc;

  /* ======================================================================
   * 1. TIỆN ÍCH CHUNG
   * ====================================================================== */

  /**
   * Làm tròn giá trị lớn nhất lên một con số "đẹp" chia hết cho số vạch,
   * để nhãn trục tung ra 0 / 500k / 1tr chứ không phải 0 / 431.276 / 862.552.
   */
  function niceMax(v, steps) {
    if (!(v > 0)) return steps;
    var raw = v / steps;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    // Nấc 3 và 4 giữ cho cột cao nhất không bị lùn: thiếu chúng thì doanh thu
    // 1,22 triệu bị làm tròn lên 2 triệu, cột chỉ còn 61% chiều cao khung.
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5
             : norm <= 3 ? 3 : norm <= 4 ? 4 : norm <= 5 ? 5 : 10;
    return step * mag * steps;
  }

  /**
   * Tạo hàm định dạng nhãn trục tung, ĐỒNG NHẤT ĐƠN VỊ cho cả trục.
   *
   * Nếu để mỗi nhãn tự chọn đơn vị theo giá trị của nó thì trục ra
   * "0 / 400k / 800k / 1,2 tr / 1,6 tr" — hai thang đo trên cùng một trục,
   * mắt phải quy đổi mới so được. Chốt đơn vị theo giá trị lớn nhất rồi áp
   * cho mọi vạch thì thành "0 / 0,4 tr / 0,8 tr / 1,2 tr / 1,6 tr", đọc một
   * mạch. Riêng vạch 0 để trần, vì "0 tr" chỉ tổ rườm rà.
   */
  function tickMaker(maxV) {
    var unit = maxV >= 1e9 ? { d: 1e9, s: ' tỷ' }
             : maxV >= 1e6 ? { d: 1e6, s: ' tr' }
             : maxV >= 1e3 ? { d: 1e3, s: 'k' }
             : { d: 1, s: '' };

    return function (v) {
      if (!v) return '0';
      var n = v / unit.d;
      var txt = (n % 1 === 0) ? String(n) : n.toFixed(1).replace('.', ',');
      return txt + unit.s;
    };
  }

  /** Đường viền cột: bo tròn 4px ở đầu, vuông ở chân. */
  function barPath(x, y, w, h, r) {
    if (h <= 0) return '';
    var rr = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) +
           'V' + (y + rr) +
           'a' + rr + ',' + rr + ' 0 0 1 ' + rr + ',' + (-rr) +
           'h' + (w - 2 * rr) +
           'a' + rr + ',' + rr + ' 0 0 1 ' + rr + ',' + rr +
           'V' + (y + h) + 'Z';
  }

  /** Gắn một tooltip dùng chung vào khung biểu đồ. */
  function tipFor(wrap) {
    var tip = wrap.querySelector('.viz-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'viz-tip';
      wrap.appendChild(tip);
    }
    return {
      show: function (html, x, y) {
        tip.innerHTML = html;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
        tip.classList.add('is-on');
      },
      hide: function () { tip.classList.remove('is-on'); }
    };
  }

  /**
   * Vẽ lại khi khung đổi bề rộng (mở/đóng sidebar, xoay máy...).
   * Dùng ResizeObserver nếu có, không thì nghe sự kiện resize của cửa sổ.
   */
  function onResize(el, draw) {
    var last = 0;
    function maybe() {
      // Khung đã bị gỡ khỏi DOM (người dùng chuyển sang mục khác) thì thôi,
      // khỏi vẽ vào một phần tử không ai nhìn thấy.
      if (!el.isConnected) return;
      var w = el.clientWidth;
      if (Math.abs(w - last) < 8) return;   // lệch vài px thì khỏi vẽ lại
      last = w;
      draw(w);
    }
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(Admin.util.debounce(maybe, 120)).observe(el);
    } else {
      window.addEventListener('resize', Admin.util.debounce(maybe, 160));
    }
    maybe();
  }

  /* ======================================================================
   * 2. BIỂU ĐỒ CỘT — doanh thu theo tháng
   * ====================================================================== */

  /**
   * opts:
   *   data    : [{ label: 'T7', full: 'Tháng 7/2026', value: 455600, extra: '2 đơn' }]
   *   format  : hàm định dạng giá trị đầy đủ cho tooltip   (mặc định: tiền VND)
   *   tickFmt : hàm định dạng nhãn trục tung (mặc định: rút gọn theo tickMaker)
   *   height  : chiều cao vùng vẽ, px
   */
  function columns(el, opts) {
    var o = opts || {};
    var data = o.data || [];
    var fmt = o.format || Admin.util.vnd;
    var H = o.height || 260;

    el.classList.add('viz');
    var tip = tipFor(el);

    onResize(el, function (W) {
      if (!W) return;
      if (!data.length) {
        el.innerHTML = Admin.ui.emptyState('bi-bar-chart', 'Chưa có số liệu');
        return;
      }

      var padL = 62, padR = 12, padT = 16, padB = 30;
      var plotW = Math.max(40, W - padL - padR);
      var plotH = Math.max(40, H - padT - padB);

      var STEPS = 4;
      var maxV = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; })), STEPS);
      var tickFmt = o.tickFmt || tickMaker(maxV);
      var band = plotW / data.length;
      var barW = Math.min(24, Math.max(6, band - 14));

      var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
                 '" role="img" aria-label="' + esc(o.aria || 'Biểu đồ cột') + '">'];

      // --- Lưới ngang + nhãn trục tung ---
      for (var i = 0; i <= STEPS; i++) {
        var v = maxV * i / STEPS;
        var y = padT + plotH - (plotH * i / STEPS);
        svg.push('<line class="' + (i === 0 ? 'axis-line' : 'grid-line') + '" x1="' + padL +
                 '" y1="' + y + '" x2="' + (padL + plotW) + '" y2="' + y + '"/>');
        svg.push('<text class="tick" x="' + (padL - 8) + '" y="' + (y + 4) +
                 '" text-anchor="end">' + esc(tickFmt(v)) + '</text>');
      }

      // --- Cột + vùng bắt chuột ---
      data.forEach(function (d, k) {
        var h = maxV > 0 ? (d.value / maxV) * plotH : 0;
        var cx = padL + band * k + band / 2;
        var x = cx - barW / 2;
        var y = padT + plotH - h;

        svg.push('<g class="band" data-k="' + k + '">');
        svg.push('<rect class="hit" x="' + (padL + band * k) + '" y="' + padT +
                 '" width="' + band + '" height="' + plotH + '"/>');
        if (h > 0) {
          svg.push('<path class="bar" d="' + barPath(x, y, barW, h, 4) + '"/>');
        } else {
          // Tháng không có doanh thu: vạch mảnh ngay trên mốc 0 để thấy rõ là
          // "bằng 0" chứ không phải "thiếu dữ liệu".
          svg.push('<rect class="bar" x="' + x + '" y="' + (padT + plotH - 2) +
                   '" width="' + barW + '" height="2" opacity=".28"/>');
        }
        svg.push('</g>');

        svg.push('<text class="tick" x="' + cx + '" y="' + (padT + plotH + 18) +
                 '" text-anchor="middle">' + esc(d.label) + '</text>');
      });

      svg.push('</svg>');
      el.innerHTML = svg.join('');

      // --- Tooltip khi rê chuột ---
      Array.prototype.forEach.call(el.querySelectorAll('.band'), function (g) {
        var d = data[+g.getAttribute('data-k')];
        g.addEventListener('mouseenter', function () { g.classList.add('is-hover'); });
        g.addEventListener('mouseleave', function () {
          g.classList.remove('is-hover');
          tip.hide();
        });
        g.addEventListener('mousemove', function (e) {
          var r = el.getBoundingClientRect();
          tip.show(
            '<div>' + esc(d.full || d.label) + '</div>' +
            '<b>' + esc(fmt(d.value)) + '</b>' +
            (d.extra ? '<div class="opacity-75">' + esc(d.extra) + '</div>' : ''),
            e.clientX - r.left,
            e.clientY - r.top - 8
          );
        });
      });
    });
  }

  /* ======================================================================
   * 3. THANH NGANG — top sản phẩm
   * Dựng bằng HTML thay vì SVG: nhãn là chữ thật nên trình đọc màn hình đọc
   * được, và tên sản phẩm dài tự xuống dòng thay vì bị cắt cụt.
   * ====================================================================== */

  /**
   * rows: [{ name, value, valueText, extra }]
   */
  function hbars(el, rows, opts) {
    var o = opts || {};
    el.classList.add('viz');
    if (!rows || !rows.length) {
      el.innerHTML = Admin.ui.emptyState('bi-bar-chart-steps', o.emptyText || 'Chưa có số liệu');
      return;
    }

    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    var tip = tipFor(el);

    el.innerHTML = rows.map(function (r, i) {
      var pct = Math.max(2, (r.value / max) * 100);
      return '<div class="hbar" data-k="' + i + '">' +
               '<div class="cap">' +
                 '<span class="nm clamp-2">' + esc(r.name) + '</span>' +
                 '<span class="val">' + esc(r.valueText) + '</span>' +
               '</div>' +
               '<div class="track"><div class="fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
             '</div>';
    }).join('');

    Array.prototype.forEach.call(el.querySelectorAll('.hbar'), function (row) {
      var r = rows[+row.getAttribute('data-k')];
      if (!r.extra) return;
      row.addEventListener('mouseleave', tip.hide);
      row.addEventListener('mousemove', function (e) {
        var box = el.getBoundingClientRect();
        tip.show('<div>' + esc(r.name) + '</div><b>' + esc(r.extra) + '</b>',
                 e.clientX - box.left, e.clientY - box.top - 8);
      });
    });
  }

  /* ======================================================================
   * 4. DẢI TRẠNG THÁI ĐƠN HÀNG
   * Mỗi dòng có biểu tượng + nhãn chữ + số đếm, nên màu chỉ là kênh phụ.
   * ====================================================================== */

  function statusBars(el, counts) {
    var total = Admin.STATUS_ORDER.reduce(function (s, k) { return s + (counts[k] || 0); }, 0);
    if (!total) {
      el.innerHTML = Admin.ui.emptyState('bi-receipt', 'Chưa có đơn hàng nào');
      return;
    }

    el.innerHTML = Admin.STATUS_ORDER.map(function (k) {
      var st = Admin.STATUS[k];
      var n = counts[k] || 0;
      var pct = (n / total) * 100;
      return '<div class="st-row">' +
               '<span class="ic st-' + k + '"><i class="bi ' + st.icon + '"></i></span>' +
               '<span class="nm">' + esc(st.label) + '</span>' +
               '<span class="track"><span class="fill bgf-' + k +
                 '" style="width:' + (n ? Math.max(3, pct) : 0).toFixed(1) + '%"></span></span>' +
               '<span class="n">' + Admin.util.num(n) +
                 ' <span class="text-ink-3 fw-normal fs-12">(' + Math.round(pct) + '%)</span></span>' +
             '</div>';
    }).join('');
  }

  /* ======================================================================
   * 5. BẢNG SỐ LIỆU THAY CHO BIỂU ĐỒ
   * ====================================================================== */

  /** Dựng bảng hai cột từ cùng bộ dữ liệu đã vẽ biểu đồ. */
  function dataTable(rows, headA, headB) {
    return '<div class="table-responsive"><table class="table table-sm mb-0">' +
             '<thead><tr><th>' + esc(headA) + '</th>' +
             '<th class="num">' + esc(headB) + '</th></tr></thead><tbody>' +
             rows.map(function (r) {
               return '<tr><td>' + esc(r.a) + '</td><td class="num">' + esc(r.b) + '</td></tr>';
             }).join('') +
           '</tbody></table></div>';
  }

  /**
   * Nút chuyển qua lại giữa biểu đồ và bảng số liệu.
   * Khung ngoài cần có lớp .viz-wrap chứa .viz và .viz-table.
   */
  function bindTableToggle(wrap) {
    var btn = wrap.querySelector('[data-toggle-table]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var on = wrap.classList.toggle('show-table');
      btn.innerHTML = on
        ? '<i class="bi bi-bar-chart me-1"></i>Biểu đồ'
        : '<i class="bi bi-table me-1"></i>Bảng số liệu';
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  Admin.chart = {
    columns: columns,
    hbars: hbars,
    statusBars: statusBars,
    dataTable: dataTable,
    bindTableToggle: bindTableToggle,
    niceMax: niceMax
  };
})(window.Admin);
