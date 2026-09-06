/* ==========================================================================
 * admin/js/page-feedback.js — Mục "Phản hồi khách hàng"
 *
 * Quản lý phản hồi trực tiếp từ bảng `feedback` trên Supabase.
 * ========================================================================== */

(function (Admin) {
  'use strict';

  var U = Admin.util, esc = U.esc, ui = Admin.ui;
  var supabase = window.supabaseClient;

  /* Mã chủ đề khớp đúng các thẻ <option> của #subject trong contact.html.
     CSDL lưu MÃ, bảng này dịch ra tiếng Việt lúc hiển thị — đổi cách gọi trên
     giao diện thì dữ liệu cũ không thành rác. */
  var SUBJECTS = {
    'bao-gia':   { label: 'Yêu cầu báo giá sỉ',        icon: 'bi-tag' },
    'in-logo':   { label: 'Đặt in logo theo yêu cầu',  icon: 'bi-brush' },
    'tu-van':    { label: 'Tư vấn chọn loại băng keo', icon: 'bi-chat-square-text' },
    'khieu-nai': { label: 'Khiếu nại chất lượng',      icon: 'bi-exclamation-octagon' },
    'hop-tac':   { label: 'Hợp tác phân phối',         icon: 'bi-people' },
    'khac':      { label: 'Nội dung khác',             icon: 'bi-three-dots' }
  };

  var state = { filter: 'all', q: '', subject: 'all' };

  /* ======================================================================
   * 1. TRUY VẤN CSDL
   * ====================================================================== */

  async function fetchAll() {
    var query = supabase.from('feedback').select('*', { count: 'exact' });
    
    if (state.filter === 'unread') {
      query = query.eq('is_read', 0);
    }
    
    if (state.subject !== 'all') {
      query = query.eq('subject', state.subject);
    }
    
    if (state.q) {
      var q = state.q;
      query = query.or('fullname.ilike.%' + q + '%,email.ilike.%' + q + '%,message.ilike.%' + q + '%');
    }

    query = query.order('created_at', { ascending: false }).order('id', { ascending: false });

    const { data, error, count } = await query;
    if (error) {
      console.error('Error fetching feedbacks:', error);
      return { rows: [], total: 0 };
    }
    
    return { rows: data || [], total: count || 0 };
  }

  async function unread() {
    const { count, error } = await supabase
      .from('feedback')
      .select('*', { head: true, count: 'exact' })
      .eq('is_read', 0);
    if (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }
    return count || 0;
  }
  Admin.feedbackUnread = unread;

  async function getTotalCount() {
    const { count, error } = await supabase
      .from('feedback')
      .select('*', { head: true, count: 'exact' });
    return count || 0;
  }

  /* ======================================================================
   * 2. VẼ TRANG
   * ====================================================================== */

  async function render(view) {
    var res = await fetchAll();
    var rows = res.rows;
    var nUnread = await unread();
    var overallTotal = await getTotalCount();
    
    view.innerHTML =
      '<div class="alert alert-primary border-0 border-start border-4 d-flex gap-3 fs-13">' +
        '<i class="bi bi-info-circle fs-5"></i>' +
        '<div>Phản hồi lưu trong bảng <code>feedback</code> trên Supabase, lấy trực tiếp từ CSDL. ' +
          'Khách ở xa gửi form thì phản hồi sẽ xuất hiện ở đây.</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header">' +
          '<div class="d-flex flex-wrap gap-2 align-items-center w-100">' +

            '<div class="btn-group" role="group" aria-label="Lọc phản hồi">' +
              chip('all', 'Tất cả', overallTotal) +
              chip('unread', 'Chưa đọc', nUnread) +
            '</div>' +

            '<select class="form-select w-auto" id="fSubject" aria-label="Lọc theo chủ đề">' +
              '<option value="all">Mọi chủ đề</option>' +
              Object.keys(SUBJECTS).map(function (k) {
                return '<option value="' + k + '"' + (state.subject === k ? ' selected' : '') +
                       '>' + esc(SUBJECTS[k].label) + '</option>';
              }).join('') +
            '</select>' +

            '<div class="position-relative" style="min-width:220px">' +
              '<i class="bi bi-search position-absolute text-ink-3" ' +
                 'style="left:.75rem;top:50%;transform:translateY(-50%)"></i>' +
              '<input type="search" class="form-control ps-5" id="fSearch" ' +
                     'placeholder="Tên, email hoặc nội dung" value="' + esc(state.q) + '" ' +
                     'aria-label="Tìm phản hồi">' +
            '</div>' +

            '<div class="ms-auto d-flex gap-2">' +
              (nUnread ? '<button type="button" class="btn btn-light border" id="fReadAll">' +
                         '<i class="bi bi-check2-all me-1"></i>Đánh dấu đã đọc hết</button>' : '') +
              (overallTotal ? '<button type="button" class="btn btn-light border" id="fCsv">' +
                       '<i class="bi bi-filetype-csv me-1"></i>Tải CSV</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card-body p-0">' + items(rows, overallTotal) + '</div>' +

        (overallTotal
          ? '<div class="card-header border-top border-bottom-0 fs-13 text-ink-2">' +
              'Hiển thị <strong>' + rows.length + '</strong> trên ' + U.num(overallTotal) +
              ' phản hồi đang lưu trong cơ sở dữ liệu' +
            '</div>'
          : '') +
      '</div>';

    bind(view);
    Admin.refreshBadges();
  }

  function chip(key, label, n) {
    var on = state.filter === key;
    return '<button type="button" class="btn btn-sm btn-' + (on ? 'primary' : 'light') +
           (on ? '' : ' border') + '" data-filter="' + key + '" aria-pressed="' + on + '">' +
           esc(label) + ' <span class="opacity-75">(' + n + ')</span></button>';
  }

  function items(rows, total) {
    if (!total) {
      return ui.emptyState('bi-chat-left-text', 'Chưa có phản hồi nào trong cơ sở dữ liệu',
        'Gửi thử một form ở trang Liên hệ rồi quay lại đây.',
        '<a class="btn btn-primary btn-sm" href="../contact.html" target="_blank" rel="noopener">' +
        '<i class="bi bi-box-arrow-up-right me-1"></i>Mở trang Liên hệ</a>');
    }
    if (!rows.length) {
      return ui.emptyState('bi-search', 'Không có phản hồi nào khớp',
        'Thử đổi từ khóa, đổi chủ đề, hoặc bỏ bộ lọc "Chưa đọc".');
    }

    return '<div class="list-group list-group-flush">' + rows.map(function (f) {
      var subj = SUBJECTS[f.subject] || { label: f.subject, icon: 'bi-tag' };

      return '<div class="list-group-item p-3' + (f.is_read ? '' : ' bg-brand-lighter') + '">' +
        '<div class="d-flex flex-wrap gap-2 align-items-start">' +
          '<div class="flex-grow-1 min-w-0">' +
            '<div class="d-flex flex-wrap align-items-center gap-2 mb-1">' +
              (f.is_read ? '' : '<span class="badge bg-primary">Mới</span>') +
              '<strong class="fs-13">' + esc(f.fullname) + '</strong>' +
              '<span class="badge bg-light text-ink-2 border fs-12">' +
                '<i class="bi ' + subj.icon + ' me-1"></i>' + esc(subj.label) + '</span>' +
              '<span class="fs-12 text-ink-3">' + esc(U.dateTimeVN(f.created_at)) + '</span>' +
            '</div>' +
            '<div class="fs-12 text-ink-3 mb-2">' +
              '<i class="bi bi-envelope me-1"></i>' + esc(f.email) +
              (f.phone ? '<span class="mx-2">·</span><i class="bi bi-telephone me-1"></i>' +
                         esc(f.phone) : '') +
              '<span class="mx-2">·</span>Mã #' + f.id +
            '</div>' +
            '<p class="fs-13 mb-0" style="white-space:pre-wrap">' + esc(f.message) + '</p>' +
          '</div>' +
          '<div class="d-flex gap-2 flex-shrink-0">' +
            '<a class="btn btn-sm btn-light border" title="Trả lời qua email" ' +
               'href="mailto:' + encodeURIComponent(f.email) +
               '?subject=' + encodeURIComponent('Phản hồi từ VGP Win Win Tape: ' + subj.label) + '">' +
              '<i class="bi bi-reply"></i></a>' +
            '<button type="button" class="btn btn-sm btn-light border" data-read="' + f.id + '" data-val="' + f.is_read +
                    '" title="' + (f.is_read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc') + '">' +
              '<i class="bi ' + (f.is_read ? 'bi-envelope' : 'bi-envelope-open') + '"></i></button>' +
            '<button type="button" class="btn btn-sm btn-light border text-danger" ' +
                    'data-del="' + f.id + '" title="Xóa phản hồi">' +
              '<i class="bi bi-trash"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ======================================================================
   * 3. SỰ KIỆN
   * ====================================================================== */

  function bind(view) {
    view.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter = b.getAttribute('data-filter');
        Admin.reload();
      });
    });

    view.querySelector('#fSubject').addEventListener('change', function (e) {
      state.subject = e.target.value;
      Admin.reload();
    });

    view.querySelector('#fSearch').addEventListener('input', U.debounce(function (e) {
      state.q = e.target.value;
      Admin.reload();
      var box = document.querySelector('#fSearch');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }, 280));

    view.querySelectorAll('[data-read]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = Number(b.getAttribute('data-read'));
        var currentRead = Number(b.getAttribute('data-val'));
        var newVal = currentRead ? 0 : 1;
        await supabase.from('feedback').update({ is_read: newVal }).eq('id', id);
        Admin.reload();
      });
    });

    view.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-del'));
        ui.confirm({
          title: 'Xóa phản hồi #' + id + '?',
          message: 'Xóa vĩnh viễn phản hồi này khỏi cơ sở dữ liệu. Không hoàn tác được.',
          okText: 'Xóa'
        }).then(async function (ok) {
          if (!ok) return;
          await supabase.from('feedback').delete().eq('id', id);
          ui.toast('Đã xóa phản hồi.', 'ok');
          Admin.reload();
        });
      });
    });

    var readAll = view.querySelector('#fReadAll');
    if (readAll) readAll.addEventListener('click', async function () {
      await supabase.from('feedback').update({ is_read: 1 }).eq('is_read', 0);
      ui.toast('Đã đánh dấu tất cả là đã đọc.', 'ok');
      Admin.reload();
    });

    var csv = view.querySelector('#fCsv');
    if (csv) csv.addEventListener('click', exportCsv);
  }

  /* ======================================================================
   * 4. XUẤT CSV
   * ====================================================================== */

  async function exportCsv() {
    var { data: rows, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (error || !rows) {
      ui.toast('Lỗi khi lấy dữ liệu xuất CSV', 'error');
      return;
    }

    var head = ['Mã', 'Thời điểm gửi', 'Họ tên', 'Email', 'Điện thoại', 'Chủ đề',
                'Nội dung', 'Đã đọc'];

    var body = rows.map(function (f) {
      return [f.id, U.dateTimeVN(f.created_at), f.fullname, f.email, f.phone || '',
              SUBJECTS[f.subject] ? SUBJECTS[f.subject].label : f.subject,
              f.message, f.is_read ? 'Rồi' : 'Chưa'];
    });

    var csv = [head].concat(body).map(function (r) {
      return r.map(function (cell) {
        return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');

    // BOM UTF-8
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'phan-hoi-khach-hang.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    ui.toast('Đã tải ' + rows.length + ' phản hồi ra file CSV.', 'ok');
  }

  Admin.page('feedback', {
    title: 'Phản hồi',
    sub: 'Tin nhắn từ form Liên hệ, lưu trong bảng feedback',
    icon: 'bi-chat-left-text',
    badge: unread,
    render: render
  });
})(window.Admin);
