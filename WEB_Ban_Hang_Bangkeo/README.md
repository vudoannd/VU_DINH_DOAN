# Website Băng Keo & Màng PE Vũ Gia Phát (VGP Win Win Tape)

Website giới thiệu sản phẩm và quản trị kinh doanh cho **Băng Keo & Màng PE Vũ Gia Phát** (VGP Win Win Tape).

---

## 1. Kiến trúc hệ thống

- **Mô hình**: Static Frontend (HTML5 / CSS3 / Vanilla JavaScript ES6+) kết hợp Backend-as-a-Service **Supabase** (PostgreSQL Database, Authentication, Realtime API).
- **Không cần build tools**: Không cần Node.js, Webpack hay Vite; mã nguồn chạy trực tiếp trên mọi static file server.
- **Frontend khách**: Giao diện người dùng đa trang (MPA) chuẩn SEO, tích hợp Bootstrap 5.3 (CDN), Bootstrap Icons và JavaScript ES6+.
- **Khu quản trị (`/admin`)**: Ứng dụng đơn trang (SPA) điều hướng bằng hash-based routing (`#/dashboard`, `#/orders`, `#/products`, `#/categories`, `#/users`, `#/feedback`, `#/settings`), hỗ trợ xác thực tài khoản và phân quyền qua Supabase Auth & Profiles.

---

## 2. Nguồn dữ liệu (Supabase PostgreSQL)

Toàn bộ dữ liệu được quản lý tập trung và đồng bộ thời gian thực qua **Supabase** với các bảng chính:

| Bảng | Mô tả |
|---|---|
| `category` | Danh mục sản phẩm băng keo & màng PE |
| `product` | Thông tin sản phẩm, giá, quy cách, hình ảnh/gallery |
| `order` | Đơn đặt hàng từ khách |
| `order_item` | Chi tiết từng mặt hàng trong đơn |
| `profiles` | Hồ sơ người dùng và phân quyền (Admin / Khách hàng) |
| `feedback` | Phản hồi, tin nhắn liên hệ gửi từ website |
| `settings` | Cấu hình website động (Hotline, Zalo, địa chỉ, thông tin chung) |

Cấu hình kết nối Supabase được đặt tại `js/supabase-config.js`.

---

## 3. Cấu trúc thư mục

```
Bangkeo_VuGiaPhat/
├── index.html            Trang chủ (Carousel, danh mục, sản phẩm nổi bật)
├── products.html         Trang sản phẩm (Bộ lọc danh mục, tìm kiếm không dấu, sắp xếp)
├── about.html            Trang giới thiệu công ty
├── blog.html             Trang tin tức, kiến thức ngành
├── contact.html          Trang liên hệ & gửi góp ý / báo giá
├── css/                  File định dạng giao diện (style.css)
├── js/
│   ├── supabase-config.js Cấu hình kết nối Supabase (URL & Anon Key)
│   └── main.js           Xử lý logic giao diện người dùng và nạp dữ liệu từ Supabase
├── admin/                Khu vực quản trị (SPA)
│   ├── index.html        Giao diện chính quản trị
│   ├── login.html        Trang đăng nhập quản trị
│   ├── css/admin.css     Style cho khu quản trị
│   └── js/               Các module trang quản trị (dashboard, orders, products,...)
└── images/               Logo, banner và hình ảnh sản phẩm
```

---

## 4. Hướng dẫn cài đặt & Khởi chạy

Chỉ cần phục vụ thư mục dự án bằng bất kỳ static web server nào:

### Dùng Python:
```bash
python -m http.server 8000
```
Sau đó mở trình duyệt tại:
- **Website khách**: `http://localhost:8000`
- **Khu quản trị**: `http://localhost:8000/admin/`

### Hoặc dùng VS Code:
- Cài đặt extension **Live Server**, nhấp chuột phải vào `index.html` và chọn **Open with Live Server**.
