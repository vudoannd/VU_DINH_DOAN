/* ==========================================================================
 * BangKeo_VuGiaPhat - main.js
 *
 * Xử lý phần động của website: nạp dữ liệu, dựng thẻ sản phẩm, lọc/tìm kiếm,
 * modal xem nhanh và form liên hệ.
 *
 * JavaScript thuần (ES6+). Các thành phần giao diện dùng sẵn của Bootstrap 5:
 *   - Carousel, Offcanvas (menu mobile), Modal, Toast, Collapse
 * File này chỉ gọi API của Bootstrap chứ không tự viết lại các thành phần đó.
 *
 * Mọi trang đều nạp chung file này; script tự nhận biết đang ở trang nào qua
 * thuộc tính <body data-page="home|products|contact">.
 * ========================================================================== */

(function () {
  'use strict';

  /* Đánh dấu "JS đang chạy" ngay khi script được nạp.
     CSS chỉ ẩn các khối .reveal khi có lớp này, nên nếu JS lỗi hoặc bị chặn
     thì nội dung vẫn hiển thị đầy đủ thay vì trắng trang. */
  document.documentElement.classList.add('js-ready');

  /* ======================================================================
   * 1. HẰNG SỐ & TIỆN ÍCH DÙNG CHUNG
   * ====================================================================== */

  var IMG_DIR      = 'images/products/';
  var PAGE_SIZE    = 12;   // số sản phẩm mỗi lần "Xem thêm"
  var HOME_LATEST  = 8;    // số sản phẩm mới nhất trên trang chủ
  var FEEDBACK_KEY = 'vgp_feedback';

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  /** Định dạng tiền Việt Nam: 8040 -> "8.040 ₫" */
  var vnd = new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0
  });
  function formatPrice(n) {
    if (n === 0) return '<span class="text-danger fw-bold">Liên hệ báo giá</span>';
    return (typeof n === 'number' && isFinite(n)) ? vnd.format(n) : 'Liên hệ';
  }

  /** Chặn chèn HTML từ dữ liệu (tiêu đề sản phẩm lấy từ file JSON). */
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Bỏ dấu tiếng Việt để tìm kiếm "không dấu".
   * Nhờ vậy gõ "bang keo" vẫn tìm ra "băng keo".
   */
  function deaccent(str) {
    return String(str || '')
      .normalize('NFD')
      // \u0300-\u036f là dải dấu tổ hợp (huyền, sắc, hỏi, ngã, nặng, mũ, móc...).
      // Viết dạng escape thay vì gõ thẳng ký tự, vì chúng vô hình trong mã nguồn.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')  // đ có gạch ngang, không nằm trong dải tổ hợp trên
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  /** Hoãn lệnh gọi cho đến khi người dùng ngừng gõ (dùng cho ô tìm kiếm). */
  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  /* ======================================================================
   * 2. NẠP & CHUẨN HÓA DỮ LIỆU
   * ====================================================================== */

  /**
   * QUAN TRỌNG: file bangkeo.json có một số key bị dính dấu cách ở hai đầu,
   * cụ thể là " moq ", " rating ", " price_vnd " và cả category.name (" Giấy ").
   * Truy cập thẳng obj.price_vnd sẽ trả về undefined.
   * Hàm này tìm key sau khi đã trim nên đọc được cả hai kiểu viết.
   */
  function pick(obj, key) {
    if (!obj) return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    var found = Object.keys(obj).filter(function (k) { return k.trim() === key; })[0];
    return found === undefined ? undefined : obj[found];
  }

  /**
   * Cấu trúc chung mà cả trang chủ lẫn trang sản phẩm đều làm việc với nó:
   *
   *   categories: [{ id, name, description, count }]
   *   products:   [{ id, title, description, moq, rating, categoryId,
   *                  categoryName, price, inStock, image, search }]
   */

  function loadData() {
    return loadFromSupabase();
  }

  function loadFromSupabase() {
    if (typeof supabaseClient === 'undefined') {
      return Promise.reject(new Error('Chưa nạp được thư viện Supabase hoặc file supabase-config.js'));
    }

    // Promise.all giúp lấy danh mục và sản phẩm cùng lúc song song để tải trang nhanh hơn
    return Promise.all([
      supabaseClient.from('category').select('*').order('id'),
      supabaseClient.from('product').select('*').order('id')
    ]).then(function (results) {
      var catRes = results[0];
      var prodRes = results[1];

      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;

      var catMap = {};
      var categories = catRes.data.map(function(c) {
        catMap[c.id] = c;
        return { id: c.id, name: c.name, description: c.description || '', count: 0 };
      });

      var products = prodRes.data.map(function(p) {
        var cat = catMap[p.category_id];
        return {
          id:           p.id,
          title:        p.name,
          description:  p.description || '',
          thickness: p.thickness || '',
            weight: p.weight || '',
            length: p.length || '',
            adhesion: p.adhesion || '',
            application: p.application || '',
            moq:          String(p.moq || '').trim(),
          rating:       (p.rating === null || p.rating === undefined) ? null : Number(p.rating),
          categoryId:   p.category_id,
          categoryName: cat ? cat.name : 'Khác',
          price:        isFinite(p.price) ? Number(p.price) : null,
          inStock:      Number(p.in_stock) !== 0,
          image:        p.image ? IMG_DIR + p.image.replace(/\.(png|jpg|jpeg)$/i, '.webp') : '',
          gallery:      p.gallery,
          galleryParsed: (function(){ try { var g = typeof p.gallery === "string" ? JSON.parse(p.gallery) : (Array.isArray(p.gallery) ? p.gallery : []); return g.map(function(img) { return img ? IMG_DIR + img.replace(/\.(png|jpg|jpeg)$/i, ".webp") : ""; }); } catch(e) { return []; } })(),
          search:       deaccent(p.name)
        };
      });

      // Đếm số lượng sản phẩm mỗi danh mục
      categories.forEach(function(c) {
        c.count = products.filter(function(p) { return p.categoryId === c.id; }).length;
      });

      return { categories: categories, products: products, source: 'supabase' };
    });
  }

  

  /**
   * Sắp xếp "mới nhất".
   * Lưu ý: file JSON KHÔNG có trường ngày tạo. Phần lớn id là mốc thời gian
   * epoch-ms (vd 1601719647235 -> 10/2020) nhưng có vài id lệch chuẩn
   * (60598884351, 10000037724350) nên không thể quy đổi ra ngày đáng tin cậy.
   * Vì vậy ta sắp xếp giảm dần theo giá trị số của id, coi đây là thứ tự nhập kho.
   */
  function byNewest(a, b) {
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  }

  /* ======================================================================
   * 3. THÀNH PHẦN GIAO DIỆN DÙNG CHUNG
   * ====================================================================== */

  /** Ảnh dự phòng (SVG nội tuyến) khi file ảnh bị thiếu -> không bao giờ vỡ ảnh. */
  var FALLBACK_IMG =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">' +
      '<rect width="200" height="150" fill="#E8F4FC"/>' +
      '<circle cx="100" cy="66" r="36" fill="none" stroke="#017DC7" stroke-width="6"/>' +
      '<circle cx="100" cy="66" r="13" fill="none" stroke="#017DC7" stroke-width="6"/>' +
      '<text x="100" y="128" text-anchor="middle" font-family="sans-serif" ' +
      'font-size="14" fill="#017DC7">Chua co anh</text></svg>'
    );

  /** Thanh sao đánh giá. rating === null -> ghi rõ "Chưa có đánh giá". */
  function starsHTML(rating) {
    if (rating === null || !isFinite(rating)) {
      return '<span class="text-body-tertiary fst-italic small">Chưa có đánh giá</span>';
    }
    var pct = Math.max(0, Math.min(100, (rating / 5) * 100));
    return '<span class="d-inline-flex align-items-center gap-2 small text-body-secondary">' +
             '<span class="stars" aria-hidden="true">' +
               '<i style="--pct:' + pct.toFixed(1) + '%">★★★★★</i>' +
             '</span>' +
             '<span>' + rating.toFixed(1) + '</span>' +
           '</span>';
  }

  /** Dựng thẻ sản phẩm bằng lớp .card của Bootstrap. isNew = gắn nhãn "Mới". */
  function productCardHTML(p, isNew) {
    var hideClass = (!p.image && document.body.getAttribute('data-page') === 'home') ? ' d-none' : '';
    return '' +
      '<div class="col-6 col-md-4 col-lg-3' + hideClass + '">' +
        '<article class="card h-100 border product-card reveal" data-id="' + esc(p.id) + '">' +
          '<div class="product-media">' +
            '<div class="position-absolute top-0 start-0 m-2 d-flex flex-column gap-1 ' +
                 'align-items-start" style="z-index:2">' +
              (isNew ? '<span class="badge text-bg-primary shadow-sm">Mới</span>' : '') +
              // Dùng bg-*-subtle chứ không phải text-bg-*-subtle: Bootstrap không có
              // biến thể "-subtle" cho text-bg-*, viết sai thì badge mất luôn nền.
              // Thêm viền để badge vẫn đọc được khi đè lên ảnh nền tối.
              (p.inStock
                ? '<span class="badge bg-success-subtle text-success-emphasis ' +
                  'border border-success-subtle shadow-sm">Còn hàng</span>'
                : '<span class="badge bg-danger-subtle text-danger-emphasis ' +
                  'border border-danger-subtle shadow-sm">Hết hàng</span>') +
            '</div>' +
                          (function() {
                var images = p.galleryParsed && p.galleryParsed.length > 0 ? p.galleryParsed : [p.image || FALLBACK_IMG];
                if (images.length === 1) {
                  return '<img src="' + esc(images[0]) + '" alt="' + esc(p.title) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + FALLBACK_IMG + '\'">';
                }
                var cid = 'cardCarousel' + p.id;
                var html = '<div id="' + cid + '" class="carousel slide h-100" data-bs-ride="false">';
                html += '<div class="carousel-inner h-100">';
                for (var i = 0; i < images.length; i++) {
                  html += '<div class="carousel-item h-100 ' + (i===0?'active':'') + '"><img src="' + esc(images[i]) + '" class="d-block w-100" alt="' + esc(p.title) + '" style="object-fit:contain;" loading="lazy" onerror="this.onerror=null;this.src=\'' + FALLBACK_IMG + '\'"></div>';
                }
                html += '</div>';
                html += '<button class="carousel-control-prev" type="button" data-bs-target="#' + cid + '" data-bs-slide="prev" onclick="event.preventDefault(); event.stopPropagation();" style="z-index: 10;"><span class="carousel-control-prev-icon bg-dark rounded-circle p-2" aria-hidden="true" style="transform: scale(0.7)"></span><span class="visually-hidden">Trước</span></button>';
                html += '<button class="carousel-control-next" type="button" data-bs-target="#' + cid + '" data-bs-slide="next" onclick="event.preventDefault(); event.stopPropagation();" style="z-index: 10;"><span class="carousel-control-next-icon bg-dark rounded-circle p-2" aria-hidden="true" style="transform: scale(0.7)"></span><span class="visually-hidden">Sau</span></button>';
                html += '</div>';
                return html;
              })() +

            '<button type="button" class="btn btn-primary btn-sm rounded-pill quick-view" ' +
                    'data-quick="' + esc(p.id) + '">' +
              '<i class="bi bi-eye me-1"></i>Xem nhanh</button>' +
          '</div>' +
          '<div class="card-body border-top d-flex flex-column gap-2 p-3">' +
            '<span class="badge rounded-pill bg-primary-subtle text-primary-emphasis ' +
                  'align-self-start fw-semibold">' + esc(p.categoryName) + '</span>' +
            '<h3 class="product-title mb-0" title="' + esc(p.title) + '">' +
              esc(p.title) + '</h3>' +
            '<div class="small text-muted mb-1" style="font-size: 0.8rem; line-height: 1.4;">' +
              (p.thickness ? '<div class="text-truncate"><b>Dày:</b> ' + esc(p.thickness) + '</div>' : '') +
              (p.weight ? '<div class="text-truncate"><b>Nặng:</b> ' + esc(p.weight) + '</div>' : '') +
              (p.length ? '<div class="text-truncate"><b>Dài:</b> ' + esc(p.length) + '</div>' : '') +
            '</div>' +
            starsHTML(p.rating) +
            '<div class="d-flex justify-content-between align-items-center gap-2 ' +
                 'mt-auto pt-2 border-top border-dashed">' +
              '<span class="product-price">' + formatPrice(p.price) + '</span>' +
              '<span class="text-end lh-sm" style="font-size:.76rem">' +
                '<span class="d-block text-body-secondary fw-semibold">Đặt tối thiểu</span>' +
                '<span class="text-body-tertiary">' + esc(p.moq || '—') + '</span>' +
              '</span>' +
            '</div>' +
          '</div>' +
        '</article>' +
      '</div>';
  }

  /** Khung xương cá trong lúc chờ dữ liệu. */
  function skeletonHTML(n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      out += '<div class="col-6 col-md-4 col-lg-3"><div class="skeleton"></div></div>';
    }
    return out;
  }

  /** Khối thông báo trạng thái (rỗng / lỗi), chiếm trọn hàng. */
  function stateHTML(title, desc, actionHTML) {
    return '<div class="col-12 text-center py-5">' +
      '<i class="bi bi-search d-block mb-3 text-body-tertiary" style="font-size:3rem"></i>' +
      '<h3 class="h5">' + esc(title) + '</h3>' +
      '<p class="text-body-secondary">' + esc(desc) + '</p>' + (actionHTML || '') +
      '</div>';
  }

  /* --- Thông báo nổi: dùng component Toast của Bootstrap ---------------- */
  function toast(msg, type) {
    var wrap = $('.toast-container');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      document.body.appendChild(wrap);
    }

    var map = {
      ok:  { icon: 'bi-check-circle-fill', cls: 'text-success' },
      err: { icon: 'bi-exclamation-circle-fill', cls: 'text-danger' }
    };
    var m = map[type] || { icon: 'bi-info-circle-fill', cls: 'text-primary' };

    var el = document.createElement('div');
    el.className = 'toast align-items-center border-0 shadow';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<div class="d-flex">' +
        '<div class="toast-body d-flex align-items-center gap-2">' +
          '<i class="bi ' + m.icon + ' ' + m.cls + ' fs-5"></i>' +
          '<span>' + esc(msg) + '</span>' +
        '</div>' +
        '<button type="button" class="btn-close me-2 m-auto" ' +
                'data-bs-dismiss="toast" aria-label="Đóng"></button>' +
      '</div>';
    wrap.appendChild(el);

    var t = new bootstrap.Toast(el, { delay: 4000 });
    el.addEventListener('hidden.bs.toast', function () { el.remove(); });
    t.show();
  }

  /* --- Hiện dần khi cuộn ---------------------------------------------- */
  var revealObserver = null;

  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      // Trình duyệt cũ: hiện hết ngay, không để nội dung kẹt ở trạng thái ẩn
      $$('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target); // mỗi phần tử chỉ chạy hiệu ứng một lần
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    observeReveal();
  }

  /** Gọi lại sau khi chèn thêm thẻ mới vào DOM. */
  function observeReveal() {
    if (!revealObserver) {
      $$('.reveal:not(.is-visible)').forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    $$('.reveal:not(.is-visible)').forEach(function (el) { revealObserver.observe(el); });
  }

  /* ======================================================================
   * 4. HEADER & NÚT LÊN ĐẦU TRANG
   * Menu mobile do component Offcanvas của Bootstrap lo, không cần code thêm.
   * ====================================================================== */

  function initHeader() {
    /* --- Tự đánh dấu mục menu của trang đang xem --- */
    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.navbar-nav .nav-link').forEach(function (a) {
      var target = (a.getAttribute('href') || '').split('?')[0].split('/').pop().toLowerCase();
      if (target && target === here) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
    });

    /* --- Bấm vào một mục menu thì đóng ngăn kéo offcanvas --- */
    var oc = $('#mainNav');
    if (oc) {
      $$('.nav-link', oc).forEach(function (a) {
        a.addEventListener('click', function () {
          var inst = bootstrap.Offcanvas.getInstance(oc);
          if (inst) inst.hide();
        });
      });
    }

    /* --- Navbar thu gọn khi cuộn xuống --- */
    var nav = $('.navbar');
    if (nav) {
      var onScroll = function () {
        nav.classList.toggle('is-scrolled', window.scrollY > 20);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  function initToTop() {
    var btn = $('.to-top');
    if (!btn) return;

    window.addEventListener('scroll', function () {
      btn.classList.toggle('is-shown', window.scrollY > 420);
    }, { passive: true });

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ======================================================================
   * 5. MODAL XEM NHANH — dùng component Modal của Bootstrap
   * ====================================================================== */

  /**
   * Bắt sự kiện bấm "Xem nhanh" ở cấp document.
   * Dùng ủy quyền sự kiện nên thẻ sản phẩm chèn sau vẫn hoạt động.
   */
  function initQuickView(getProduct) {
    var modalEl = $('#quickViewModal');
    if (!modalEl) return;
    var modal = new bootstrap.Modal(modalEl);

          document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-quick]');
        if (!btn) return;
        var p = getProduct(btn.getAttribute('data-quick'));
        if (!p) return;
  
        $('#quickViewLabel', modalEl).textContent = p.title;

        // Build Image Gallery
        var galleryHtml = '';
        var images = [];
        
        // Parse gallery if it's a JSON string
        var parsedGallery = [];
        if (p.galleryParsed && p.galleryParsed.length > 0) { parsedGallery = p.galleryParsed; } else if (typeof p.gallery === 'string' && p.gallery.trim().startsWith('[')) {
            try {
                parsedGallery = JSON.parse(p.gallery);
            } catch (e) {
                console.error("Lỗi parse gallery:", e);
            }
        } else if (Array.isArray(p.gallery)) {
            parsedGallery = p.gallery;
        }

        if (parsedGallery && parsedGallery.length > 0) {
            images = parsedGallery;
        } else if (p.image) {
            images = [p.image];
        } else {
            images = [FALLBACK_IMG];
        }

        if (images.length === 1) {
            galleryHtml = '<div class="product-media border rounded"><img src="' + esc(images[0]) + '" alt="' + esc(p.title) + '" onerror="this.onerror=null;this.src=\'' + FALLBACK_IMG + '\'"></div>';
        } else {
            // Build Bootstrap Carousel
            var carouselId = 'carouselProduct' + p.id;
            var indicators = '<div class="carousel-indicators">';
            var inner = '<div class="carousel-inner rounded border">';
            
            for (var i = 0; i < images.length; i++) {
                var active = i === 0 ? 'active' : '';
                var activeAria = i === 0 ? 'aria-current="true"' : '';
                indicators += '<button type="button" data-bs-target="#' + carouselId + '" data-bs-slide-to="' + i + '" class="' + active + '" ' + activeAria + ' aria-label="Slide ' + (i+1) + '"></button>';
                inner += '<div class="carousel-item ' + active + '"><img src="' + esc(images[i]) + '" class="d-block w-100" style="object-fit: contain; aspect-ratio: 1/1;" alt="Hình ' + (i+1) + '" onerror="this.onerror=null;this.src=\'' + FALLBACK_IMG + '\'"></div>';
            }
            indicators += '</div>';
            inner += '</div>';
            
            var controls = '<button class="carousel-control-prev" type="button" data-bs-target="#' + carouselId + '" data-bs-slide="prev"><span class="carousel-control-prev-icon bg-dark rounded-circle" style="padding: 1.5rem" aria-hidden="true"></span><span class="visually-hidden">Trước</span></button>' +
                           '<button class="carousel-control-next" type="button" data-bs-target="#' + carouselId + '" data-bs-slide="next"><span class="carousel-control-next-icon bg-dark rounded-circle" style="padding: 1.5rem" aria-hidden="true"></span><span class="visually-hidden">Sau</span></button>';
            
            galleryHtml = '<div id="' + carouselId + '" class="carousel slide" data-bs-ride="carousel">' + indicators + inner + controls + '</div>';
        }

        $('#quickViewBody', modalEl).innerHTML =
          '<div class="row g-4">' +
            '<div class="col-sm-5">' +
              galleryHtml +
            '</div>' +
            '<div class="col-sm-7">' +
              '<span class="badge rounded-pill bg-primary-subtle text-primary-emphasis mb-2">' +
                esc(p.categoryName) + '</span>' +
              '<div class="mb-2">' + starsHTML(p.rating) + '</div>' +
              '<p class="fw-bold text-brand mb-0" style="font-size:1.6rem">' +
                formatPrice(p.price) + '</p>' +
              '<p class="small text-body-tertiary">' +
                'Giá tham khảo cho một đơn vị. Liên hệ để được báo giá sỉ lớn.</p>' +
              (function() {
              var specs = { text: p.description || '', thickness: p.thickness || '', weight: p.weight || '', length: p.length || '', adhesion: p.adhesion || '', application: p.application || '' };
              var html = '';
              if (specs.text) {
                html += '<p class="small border-top pt-3" style="white-space:pre-wrap">' + esc(specs.text) + '</p>';
              }
              html += '<dl class="row row-cols-1 small border-top mb-3 pt-3">';
              html += specRow('Mã sản phẩm', p.id);
              html += specRow('Danh mục', p.categoryName);
              if (specs.thickness) html += specRow('Độ dày màng (mic)', specs.thickness);
              if (specs.weight) html += specRow('Trọng lượng (kg/cây)', specs.weight);
              if (specs.length) html += specRow('Chiều dài (yard)', specs.length);
              if (specs.adhesion) html += specRow('Độ bám dính', specs.adhesion);
              if (specs.application) html += specRow('Ứng dụng', specs.application);
              html += specRow('Đặt hàng tối thiểu', p.moq || '-');
              html += specRow('Tình trạng', p.inStock ? 'Còn hàng' : 'Hết hàng');
              html += '</dl>';
              return html;
            })() +
            '<div class="d-flex flex-column gap-2 mt-3">' +
              '<a class="btn btn-primary w-100" href="contact.html">' +
                '<i class="bi bi-envelope me-1"></i>Nhận báo giá sỉ</a>' +
              '<a class="btn w-100 text-white" style="background-color: #0068ff" href="' + (window.__SETTINGS_MAP__ && window.__SETTINGS_MAP__.zalo_link ? window.__SETTINGS_MAP__.zalo_link : '#') + '" target="_blank">' +
                '<i class="bi bi-chat-dots me-1"></i>Chat Zalo (' + (window.__SETTINGS_MAP__ && window.__SETTINGS_MAP__.hotline1 ? window.__SETTINGS_MAP__.hotline1 : '') + ')</a>' +
              '<a class="btn btn-success w-100" href="tel:' + (window.__SETTINGS_MAP__ && window.__SETTINGS_MAP__.hotline1 ? window.__SETTINGS_MAP__.hotline1.replace(/\s+/g, '') : '') + '">' +
                '<i class="bi bi-telephone-fill me-1"></i>Gọi Hotline (' + (window.__SETTINGS_MAP__ && window.__SETTINGS_MAP__.hotline1 ? window.__SETTINGS_MAP__.hotline1 : '') + ')</a>' +
            '</div>' +
          '</div>' +
        '</div>';

      modal.show();
    });
  }

  function specRow(label, value) {
    return '<div class="d-flex justify-content-between gap-3 py-2 border-bottom">' +
             '<dt class="fw-normal text-body-tertiary">' + esc(label) + '</dt>' +
             '<dd class="mb-0 fw-semibold text-end">' + esc(value) + '</dd>' +
           '</div>';
  }

  /* ======================================================================
   * 6. TRANG CHỦ
   * ====================================================================== */

  function initHome(data) {
    /* --- Thẻ danh mục --- */
    var catWrap = $('#catGrid');
    if (catWrap) {
      /* Biểu tượng lấy từ bộ Bootstrap Icons, gán theo mã danh mục. Đây là thứ
         duy nhất còn viết cứng ở đây — tên và mô tả đều lấy từ CSDL, nên sửa
         danh mục trong /admin là trang chủ đổi theo. Danh mục mới do quản trị
         viên thêm sẽ dùng biểu tượng mặc định. */
      var icons = { 1: 'bi-tags', 2: 'bi-box-seam', 3: 'bi-layers', 4: 'bi-brush', 5: 'bi-archive' };

      catWrap.innerHTML = data.categories.map(function (c, i) {
        return '<div class="col-md-4">' +
          '<a class="card h-100 border text-decoration-none text-body p-4 cat-card reveal" ' +
             'data-delay="' + (i % 4) + '" href="products.html?cat=' + c.id + '">' +
            '<span class="cat-icon mb-3"><i class="bi ' +
              (icons[c.id] || 'bi-record-circle') + '"></i></span>' +
            '<h3 class="h5">' + esc(c.name) + '</h3>' +
            '<p class="text-body-secondary small flex-grow-1">' +
              esc(c.description || 'Đa dạng mẫu mã, đáp ứng mọi nhu cầu đóng gói.') + '</p>' +
            '<span class="fw-semibold text-brand small">' + c.count + ' sản phẩm ' +
              '<i class="bi bi-arrow-right cat-arrow"></i></span>' +
          '</a></div>';
      }).join('');
    }

    /* --- Sản phẩm mới nhất --- */
    var grid = $('#latestGrid');
    if (grid) {
      var latest = data.products.slice().sort(byNewest).slice(0, HOME_LATEST);
      grid.innerHTML = latest.length
        ? latest.map(function (p, i) { return productCardHTML(p, i < 4); }).join('')
        : stateHTML('Chưa có sản phẩm', 'Danh sách sản phẩm đang được cập nhật.');
      observeReveal();
    }

    /* --- Khởi tạo Carousel động dựa trên danh mục --- */
    var indicatorsEl = $('#heroCarouselIndicators');
    var innerEl = $('#heroCarouselInner');
    if (indicatorsEl && innerEl) {
      // Lọc các danh mục có sản phẩm, lấy tối đa 4 danh mục
      var activeCats = data.categories.filter(function(c) { return c.count > 0; }).slice(0, 4);
      
      // Từ điển Marketing Copy map theo id danh mục
      var marketingCopy = {
        1: { head: 'Tem nhãn nhiệt in sắc nét, dán chắc', sub: 'Băng keo giấy dễ xé tay, tem nhãn vận chuyển khổ 4x6 và nhãn mã vạch tổng hợp — đáp ứng trọn khâu đóng gói và hậu cần.' },
        2: { head: 'Dán thùng carton bền chắc, chịu nhiệt', sub: 'Băng keo OPP/BOPP keo acrylic gia cường, chống thấm nước, ít tiếng ồn khi xé — lựa chọn hàng đầu cho kho vận và nhà máy.' },
        3: { head: 'Độ dính cao, bám tốt mọi bề mặt', sub: 'Từ băng keo lưới sợi thủy tinh gia cường đến gioăng cao su EVA — nhận sản xuất theo yêu cầu, in logo thương hiệu riêng.' }
      };

      var indicatorsHtml = '';
      var innerHtml = '';

      activeCats.forEach(function(c, i) {
        var activeClass = i === 0 ? 'active' : '';
        var ariaCurrent = i === 0 ? 'aria-current="true"' : '';
        
        indicatorsHtml += '<button type="button" data-bs-target="#heroCarousel" data-bs-slide-to="' + i + '" ' +
                          'class="' + activeClass + '" ' + ariaCurrent + ' aria-label="Slide ' + (i+1) + '"></button>';
        
        // Lấy 1 sản phẩm đại diện
        var sample = data.products.filter(function(p) { return p.categoryId === c.id; })[0];
        var imgSrc = sample && sample.image ? sample.image : FALLBACK_IMG;
        
        // Nội dung Marketing
        var copy = marketingCopy[c.id] || {
          head: 'Giải pháp ' + esc(c.name) + ' chất lượng cao',
          sub: c.description ? esc(c.description) : 'Sản phẩm đạt tiêu chuẩn chất lượng cao, độ bám dính tốt, giá sỉ tận xưởng dành cho doanh nghiệp.'
        };
        
        innerHtml += 
          '<div class="carousel-item ' + activeClass + '" data-cat="' + c.id + '">' +
            '<div class="hero-slide">' +
              '<img class="slide-bg" src="' + esc(imgSrc) + '" alt="' + esc(c.name) + '" onerror="this.onerror=null;this.src=\'' + FALLBACK_IMG + '\'">' +
              '<div class="container slide-content">' +
                '<span class="badge rounded-pill bg-white bg-opacity-25 border border-white border-opacity-50 mb-3 text-uppercase">' +
                  esc(c.name) +
                '</span>' +
                '<h2 class="mb-3">' + esc(copy.head) + '</h2>' +
                '<p class="mb-4 opacity-75" style="max-width:480px">' + esc(copy.sub) + '</p>' +
                '<div class="d-flex flex-wrap gap-2">' +
                  '<a class="btn btn-primary rounded-pill px-4" href="products.html?cat=' + c.id + '">Xem sản phẩm</a>' +
                  '<a class="btn btn-warning text-dark fw-bold rounded-pill px-4" href="contact.html">Nhận báo giá</a>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
      });

      indicatorsEl.innerHTML = indicatorsHtml;
      innerEl.innerHTML = innerHtml;
    }
  }

  /* ======================================================================
   * 7. TRANG SẢN PHẨM
   * ====================================================================== */

  function initProducts(data) {
    var grid = $('#productGrid');
    if (!grid) return;

    var chipsWrap = $('#catChips');
    var searchInp = $('#searchInput');
    var sortSel   = $('#sortSelect');
    var countEl   = $('#resultCount');
    var moreWrap  = $('#loadMoreWrap');
    var moreBtn   = $('#loadMoreBtn');

    // Trạng thái bộ lọc hiện tại
    var state = { cat: 'all', q: '', sort: 'newest', shown: PAGE_SIZE };

    /* --- Đọc bộ lọc từ URL (?cat=2) để link chia sẻ / F5 vẫn giữ nguyên --- */
    var params = new URLSearchParams(location.search);
    var catParam = params.get('cat');
    if (catParam && data.categories.some(function (c) { return String(c.id) === catParam; })) {
      state.cat = catParam;
    }
    var qParam = params.get('q');
    if (qParam) {
      state.q = qParam;
      if (searchInp) searchInp.value = qParam;
    }

    /* --- Dựng thanh chip danh mục --- */
    if (chipsWrap) {
      var chips = [{ id: 'all', name: 'Tất cả', count: data.products.length }]
        .concat(data.categories.map(function (c) {
          return { id: String(c.id), name: c.name, count: c.count };
        }));

      chipsWrap.innerHTML = chips.map(function (c) {
        return '<button type="button" class="btn btn-outline-secondary chip" ' +
               'data-cat="' + esc(c.id) + '" ' +
               'aria-pressed="' + (String(c.id) === state.cat) + '">' +
               esc(c.name) + ' <span class="n">(' + c.count + ')</span></button>';
      }).join('');

      chipsWrap.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        state.cat = chip.getAttribute('data-cat');
        state.shown = PAGE_SIZE;
        $$('.chip', chipsWrap).forEach(function (c) {
          c.setAttribute('aria-pressed', String(c === chip));
        });
        syncURL();
        render();
      });
    }

    /* --- Ô tìm kiếm (chờ người dùng gõ xong mới lọc) --- */
    if (searchInp) {
      searchInp.addEventListener('input', debounce(function () {
        state.q = searchInp.value.trim();
        state.shown = PAGE_SIZE;
        syncURL();
        render();
      }, 250));
    }

    /* --- Sắp xếp --- */
    if (sortSel) {
      sortSel.addEventListener('change', function () {
        state.sort = sortSel.value;
        state.shown = PAGE_SIZE;
        render();
      });
    }

    /* --- Xem thêm --- */
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        state.shown += PAGE_SIZE;
        render();
      });
    }

    /**
     * Ghi bộ lọc lên thanh địa chỉ mà không tải lại trang.
     * Nhờ vậy F5 hoặc gửi link cho người khác vẫn giữ đúng kết quả đang xem.
     */
    function syncURL() {
      var p = new URLSearchParams();
      if (state.cat !== 'all') p.set('cat', state.cat);
      if (state.q) p.set('q', state.q);
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }

    /** Áp dụng lọc + sắp xếp, trả về danh sách kết quả. */
    function apply() {
      var list = data.products.slice();

      if (state.cat !== 'all') {
        list = list.filter(function (p) { return String(p.categoryId) === state.cat; });
      }

      if (state.q) {
        var key = deaccent(state.q);
        list = list.filter(function (p) {
          return p.search.indexOf(key) !== -1 ||
                 deaccent(p.categoryName).indexOf(key) !== -1;
        });
      }

      switch (state.sort) {
        case 'price-asc':
          list.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
          break;
        case 'price-desc':
          list.sort(function (a, b) { return (b.price || 0) - (a.price || 0); });
          break;
        case 'rating':
          // Sản phẩm chưa có đánh giá (null) luôn xếp cuối danh sách
          list.sort(function (a, b) {
            if (a.rating === null && b.rating === null) return byNewest(a, b);
            if (a.rating === null) return 1;
            if (b.rating === null) return -1;
            return b.rating - a.rating;
          });
          break;
        default:
          list.sort(byNewest);
      }
      return list;
    }

    /** Đưa trạng thái về mặc định (dùng cho nút "Xóa bộ lọc"). */
    function resetFilters() {
      state.cat = 'all';
      state.q = '';
      state.shown = PAGE_SIZE;
      if (searchInp) searchInp.value = '';
      if (chipsWrap) {
        $$('.chip', chipsWrap).forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.getAttribute('data-cat') === 'all'));
        });
      }
      syncURL();
      render();
    }

    function render() {
      var list  = apply();
      var slice = list.slice(0, state.shown);

      if (list.length === 0) {
        grid.innerHTML = stateHTML(
          'Không tìm thấy sản phẩm nào',
          'Thử đổi từ khóa khác hoặc chọn lại danh mục.',
          '<button type="button" class="btn btn-outline-primary" id="resetFilter">' +
          '<i class="bi bi-x-circle me-1"></i>Xóa bộ lọc</button>'
        );
        // Khối trạng thái vừa được chèn lại nên phải gắn sự kiện ở đây
        var reset = $('#resetFilter');
        if (reset) reset.addEventListener('click', resetFilters);
      } else {
        grid.innerHTML = slice.map(function (p) { return productCardHTML(p, false); }).join('');
        observeReveal();
      }

      if (countEl) {
        countEl.innerHTML = list.length
          ? 'Hiển thị <strong class="text-brand">' + slice.length + '</strong> trên ' +
            list.length + ' sản phẩm'
          : '';
      }
      if (moreWrap) moreWrap.hidden = slice.length >= list.length;
    }

    render();
  }

  /* ======================================================================
   * 8. TRANG LIÊN HỆ — FORM GỬI FEEDBACK
   * Dùng lớp .is-invalid / .invalid-feedback của Bootstrap để báo lỗi.
   * ====================================================================== */

  function initContact() {
    var form = $('#contactForm');
    if (!form) return;

    /* Quy tắc kiểm tra cho từng ô nhập. */
    var rules = {
      name: {
        test: function (v) { return v.trim().length >= 2; },
        msg: 'Vui lòng nhập họ tên (ít nhất 2 ký tự).'
      },
      email: {
        test: function (v) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim()); },
        msg: 'Email chưa đúng định dạng, ví dụ: ten@congty.com'
      },
      phone: {
        // Số điện thoại Việt Nam: bắt đầu bằng 0 hoặc +84, tổng 10–11 chữ số
        test: function (v) { return /^(0|\+84)\d{9,10}$/.test(v.replace(/[\s.\-()]/g, '')); },
        msg: 'Số điện thoại chưa hợp lệ, ví dụ: 0901234567'
      },
      subject: {
        test: function (v) { return v.trim() !== ''; },
        msg: 'Vui lòng chọn chủ đề liên hệ.'
      },
      message: {
        test: function (v) { return v.trim().length >= 10; },
        msg: 'Nội dung cần ít nhất 10 ký tự để chúng tôi hỗ trợ chính xác.'
      }
    };

    /** Hiện / ẩn lỗi của một ô nhập bằng lớp của Bootstrap. */
    function setError(field, msg) {
      var box = $('#err-' + field.name);
      if (msg) {
        field.classList.add('is-invalid');
        field.setAttribute('aria-invalid', 'true');
        if (box) box.textContent = msg;
      } else {
        field.classList.remove('is-invalid');
        field.removeAttribute('aria-invalid');
        if (box) box.textContent = '';
      }
    }

    function validateField(field) {
      var rule = rules[field.name];
      if (!rule) return true;
      var ok = rule.test(field.value);
      setError(field, ok ? '' : rule.msg);
      return ok;
    }

    /* Kiểm tra lại ngay khi người dùng sửa ô đang báo lỗi. */
    Object.keys(rules).forEach(function (name) {
      var field = form.elements[name];
      if (!field) return;
      field.addEventListener('blur', function () { validateField(field); });
      field.addEventListener('input', function () {
        if (field.classList.contains('is-invalid')) validateField(field);
      });
    });

    form.addEventListener('submit', function (e) {
      // Tự kiểm tra bằng JS thay vì dựa vào thông báo mặc định của trình duyệt
      e.preventDefault();

      var firstBad = null;
      Object.keys(rules).forEach(function (name) {
        var field = form.elements[name];
        if (field && !validateField(field) && !firstBad) firstBad = field;
      });

      if (firstBad) {
        firstBad.focus();
        toast('Vui lòng kiểm tra lại các ô còn thiếu.', 'err');
        return;
      }
      // Lấy nút submit để hiển thị trạng thái loading
      var btn = form.querySelector('button[type="submit"]');
      var originalBtnText = btn ? btn.textContent : 'Gửi liên hệ';
      
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Đang gửi...';
      }

      var record = {
        fullname:   form.elements.name.value.trim(),
        email:      form.elements.email.value.trim(),
        phone:      form.elements.phone.value.trim(),
        company:    form.company.value.trim() || null,
        subject:    form.elements.subject.value,
        quantity:   form.quantity.value.trim() || null,
        message:    form.elements.message.value.trim(),
        created_at: new Date().toISOString()
      };

      if (typeof supabaseClient === 'undefined') {
        toast('Lỗi hệ thống: Chưa kết nối được máy chủ.', 'err');
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalBtnText;
        }
        return;
      }

      supabaseClient.from('feedback').insert([record]).then(function(res) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalBtnText;
        }

        if (res.error) {
          console.error(res.error);
          toast('Đã có lỗi xảy ra. Vui lòng thử lại sau.', 'err');
        } else {
          form.reset();
          Object.keys(rules).forEach(function (name) {
            var field = form.elements[name];
            if (field) setError(field, '');
          });
          toast('Cảm ơn ' + record.fullname + '! Chúng tôi sẽ phản hồi trong 24 giờ.', 'ok');
        }
      });
    });
  }

  /* ======================================================================
   * 9. KHỞI CHẠY
   * ====================================================================== */

  function initFloatingWidgets() {
    var phone = (window.__SETTINGS_MAP__ && window.__SETTINGS_MAP__.hotline1)
      ? window.__SETTINGS_MAP__.hotline1.replace(/\s+/g, '')
      : '02838123456';
    var zalo = (window.__SETTINGS_MAP__ && window.__SETTINGS_MAP__.zalo_link)
      ? window.__SETTINGS_MAP__.zalo_link
      : 'https://zalo.me/0901234567';

    var div = document.createElement('div');
    div.className = 'floating-widget';
    div.innerHTML = 
      '<a href="tel:' + phone + '" class="float-btn float-phone" aria-label="Gọi điện thoại" data-setting-href="hotline1" data-setting-prefix="tel:">' +
        '<i class="bi bi-telephone-fill"></i>' +
        '<span class="tooltip-text">Gọi Hotline</span>' +
      '</a>' +
      '<a href="' + zalo + '" target="_blank" class="float-btn float-zalo" aria-label="Chat Zalo" data-setting-href="zalo_link">' +
        'Zalo' +
        '<span class="tooltip-text">Chat Zalo</span>' +
      '</a>';
    document.body.appendChild(div);
  }


  function loadSettings() {
    if (typeof window.supabaseClient === 'undefined') return;
    window.supabaseClient.from('settings').select('*')
      .then(function(res) {
        if (res.error) {
          console.error('Lỗi tải settings:', res.error);
          return;
        }
        window.__SETTINGS_MAP__ = {};
        var settingsMap = window.__SETTINGS_MAP__;
        res.data.forEach(function(row) {
          settingsMap[row.key] = row.value;
        });

        var textEls = document.querySelectorAll('[data-setting-text]');
        for (var i = 0; i < textEls.length; i++) {
          var key = textEls[i].getAttribute('data-setting-text');
          if (settingsMap[key]) {
            textEls[i].textContent = settingsMap[key];
          }
        }

        var hrefEls = document.querySelectorAll('[data-setting-href]');
        for (var j = 0; j < hrefEls.length; j++) {
          var key = hrefEls[j].getAttribute('data-setting-href');
          var prefix = hrefEls[j].getAttribute('data-setting-prefix') || '';
          if (settingsMap[key]) {
             var val = settingsMap[key];
             if (prefix === 'tel:') {
                val = val.replace(/\s+/g, '');
             }
             hrefEls[j].setAttribute('href', prefix + val);
          }
        }
      });
  }

  function boot() {
    var page = document.body.getAttribute('data-page') || '';

    initHeader();
    initToTop();
    initReveal();
    initFloatingWidgets();
    loadSettings();

    // Trang liên hệ không cần dữ liệu sản phẩm -> chạy ngay
    if (page === 'contact') {
      initContact();
      return;
    }

    // Hiện khung xương cá trong lúc chờ dữ liệu
    var latestGrid  = $('#latestGrid');
    var productGrid = $('#productGrid');
    if (latestGrid)  latestGrid.innerHTML  = skeletonHTML(HOME_LATEST);
    if (productGrid) productGrid.innerHTML = skeletonHTML(PAGE_SIZE);

    loadData().then(function (data) {
      // Ghi ra Console để mở F12 là biết ngay trang đang đọc từ đâu
      console.info('Dữ liệu tải từ Supabase (' +
        data.products.length + ' sản phẩm, ' + data.categories.length + ' danh mục).');

      // Tra về sản phẩm theo id cho modal xem nhanh
      var byId = {};
      data.products.forEach(function (p) { byId[p.id] = p; });
      initQuickView(function (id) { return byId[id]; });

      if (page === 'home')     initHome(data);
      if (page === 'products') initProducts(data);
    })['catch'](function (err) {
      console.error('Lỗi nạp dữ liệu:', err);
      var msg = stateHTML(
        'Không tải được dữ liệu sản phẩm',
        'Không thể nạp dữ liệu từ máy chủ Supabase. Vui lòng kiểm tra lại kết nối mạng.'
      );
      if (latestGrid)  latestGrid.innerHTML  = msg;
      if (productGrid) productGrid.innerHTML = msg;
      toast('Không tải được dữ liệu sản phẩm.', 'err');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
