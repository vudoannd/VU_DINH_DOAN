# Báo cáo Dự án Website Băng Keo & Màng PE Vũ Gia Phát (VGP Win Win Tape)
        link web: https://vudoannd.github.io/Bangkeo_VuGiaPhat/
        link web quản trị: https://vudoannd.github.io/Bangkeo_VuGiaPhat/admin
                  (user: admin@vugiaphat.vn)
                  (pass: 123456)

## 1. Tổng quan Dự án
- **Tên dự án**: Website Băng Keo & Màng PE Vũ Gia Phát (VGP Win Win Tape).
- **Mục tiêu**: Xây dựng một website kết hợp giới thiệu sản phẩm trực tuyến (catalog) và hệ thống quản trị nội bộ dành cho xưởng sản xuất băng keo và màng PE Vũ Gia Phát. Do đặc thù kinh doanh B2B và bán sỉ, website không tích hợp thanh toán/giỏ hàng trực tuyến mà tập trung vào việc hiển thị thông số kỹ thuật sản phẩm rõ ràng, hỗ trợ khách hàng gửi yêu cầu báo giá/đặt hàng sỉ thông qua form liên hệ.

## 2. Kiến trúc Hệ thống & Công nghệ
Dự án được xây dựng theo mô hình **Static Frontend kết hợp Backend-as-a-Service (BaaS)** tinh gọn:

- **Frontend (Giao diện Khách hàng & Quản trị)**:
  - Phát triển bằng **HTML5, CSS3, và Vanilla JavaScript (ES6+)**.
  - **Không sử dụng công cụ Build (No Build Tools)**: Không cần Webpack, Vite hay Node.js. Mã nguồn có thể chạy trực tiếp trên mọi máy chủ tĩnh (Live Server, Apache, Nginx, GitHub Pages...).
  - Giao diện đáp ứng (Responsive) và các component (Modal, Offcanvas, Toast...) được xây dựng trên **Bootstrap 5.3** (CDN) và **Bootstrap Icons**.
- **Backend & Cơ sở dữ liệu**:
  - Ứng dụng **Supabase** để xử lý hoàn toàn phần Backend (PostgreSQL Database, Authentication, Realtime API).
  - Tương tác với CSDL qua thư viện `supabase-js` ở phía Client.

## 3. Cấu trúc Ứng dụng
Hệ thống được thiết kế phân tách rõ ràng thành 2 phân hệ:

- **Phân hệ Khách hàng (Public - MPA)**: Được thiết kế dưới dạng Ứng dụng đa trang (Multi-Page Application) để tối ưu cho SEO cục bộ.
  - Các trang chính: `index.html` (Trang chủ), `products.html` (Sản phẩm), `about.html` (Giới thiệu), `blog.html` (Tin tức), `contact.html` (Liên hệ).
  - Script dùng chung (`js/main.js`) tự động nhận diện ngữ cảnh trang qua thuộc tính `data-page` để tải dữ liệu tương ứng.
- **Phân hệ Quản trị (Admin - SPA)**: Nằm gọn trong thư mục `/admin`, được xây dựng như một Ứng dụng đơn trang (Single Page Application).
  - Toàn bộ giao diện quản trị nằm trên `admin/index.html`.
  - Sử dụng **Hash-based routing** (`#/dashboard`, `#/orders`, `#/products`,...) kết hợp với cấu trúc module Javascript (`app.js`, `core.js`, `page-*.js`) để điều hướng mượt mà, giúp khởi tạo CSDL một lần duy nhất, tăng tối đa tốc độ phản hồi.

## 4. Các Chức năng chính

### 4.1. Giao diện Khách hàng (Client-side)
- **Xem Catalog Sản phẩm**: Liệt kê trực quan các dòng sản phẩm (Băng keo trong, đục, màu, in logo, màng PE). Hỗ trợ xem chi tiết quy cách, độ dày, MOQ (Số lượng tối thiểu) thông qua tính năng **Xem nhanh (Quick View Modal)** mà không cần chuyển trang.
- **Tìm kiếm & Lọc thông minh**: Cho phép lọc sản phẩm theo danh mục, sắp xếp theo giá/độ mới, và đặc biệt là tính năng tìm kiếm tiếng Việt không dấu tự phát triển (hỗ trợ nhập liệu thoải mái).
- **Yêu cầu Báo giá & Liên hệ**: Form liên hệ kiểm duyệt dữ liệu (validation) tự động, giúp khách gửi thông tin nhập sỉ, xin tư vấn hoặc đặt in logo. Dữ liệu được đẩy thẳng vào CSDL Supabase thời gian thực.
- **Cấu hình Động**: Các thông tin như Hotline, Địa chỉ, Email được tải tự động từ CSDL, giúp Admin dễ dàng thay đổi mà không cần sửa mã nguồn.

### 4.2. Bảng điều khiển Quản trị (Admin Dashboard)
- **Đăng nhập & Xác thực**: Bảo mật nghiêm ngặt qua Supabase Auth.
- **Quản lý Đơn hàng nội bộ (Orders)**: Giao diện cho phép Admin tạo mới, chỉnh sửa trạng thái và liệt kê đơn hàng. Logic lưu trữ tách biệt `unit_price` của dòng hàng (`order_item`) và giá gốc của sản phẩm (`product`), đảm bảo toàn vẹn lịch sử đơn hàng khi bảng giá thay đổi.
- **Quản lý Kho sản phẩm (Products) & Danh mục (Categories)**: Cung cấp đầy đủ công cụ CRUD (Thêm, Đọc, Sửa, Xóa) cho danh mục và thông số chi tiết của sản phẩm.
- **Quản lý Phản hồi (Feedback)**: Thu thập tin nhắn từ form liên hệ của khách hàng, theo dõi tình trạng xử lý.
- **Quản lý Tài khoản (Users)**: Danh sách thông tin hồ sơ (profiles).

## 5. Cấu trúc Cơ sở dữ liệu (PostgreSQL qua Supabase)
Bao gồm các bảng có liên kết logic (Foreign Keys):
1. **`category`**: Quản lý nhóm danh mục sản phẩm.
2. **`product`**: Lưu trữ sản phẩm, thông số, liên kết tới `category_id`.
3. **`order`**: Lưu trữ thông tin tổng quan của hóa đơn (ID, Ngày lập, Trạng thái, Tổng tiền).
4. **`order_item`**: Chi tiết hóa đơn (ID Đơn, ID Sản phẩm, Số lượng, Đơn giá lúc lập đơn, Thành tiền). Đảm bảo rule: *Tổng `subtotal` luôn bằng `total_amount` của `order`*.
5. **`feedback`**: Lưu vết các yêu cầu liên hệ từ người dùng ngoài.
6. **`profiles`**: Bảng hồ sơ người dùng mở rộng liên kết với Auth Users của Supabase.
7. **`settings`**: Lưu cấu hình hiển thị UI (Số điện thoại, địa chỉ...).

## 6. Đánh giá & Nhận xét Thiết kế

**Ưu điểm:**
- **Triển khai cực nhẹ & Linh hoạt (Low Maintenance)**: Vì là kiến trúc HTML/JS tĩnh hoàn toàn kết hợp BaaS, dự án loại bỏ được gánh nặng duy trì Server-side (như PHP, Node.js). Có thể host mã nguồn hoàn toàn miễn phí trên Vercel, Netlify hoặc GitHub Pages.
- **Hiệu năng Cao (High Performance)**: Code Frontend gọi API song song (Promise.all), kiến trúc Admin SPA không cần load lại trang. Hạn chế lệ thuộc các thư viện nặng giúp tốc độ cực nhanh.
- **Thiết kế Nghiệp vụ thực tế (Pragmatic Design)**: Logic không gượng ép bắt khách hàng B2B phải "cho vào giỏ" và "thanh toán online", thay vào đó điều hướng họ điền form tư vấn. Bù lại, Admin có module quản lý đơn hàng riêng để xử lý quy trình chốt đơn thủ công.

**Điểm có thể cải thiện (Nhược điểm):**
- **Phụ thuộc 100% vào Supabase**: Toàn bộ hoạt động lưu trữ, API, truy xuất dữ liệu động phụ thuộc vào Supabase. 
- **Giới hạn SEO cho nội dung động**: Các trình thu thập dữ liệu web có thể không lập chỉ mục đầy đủ các trang mô tả chi tiết sản phẩm nếu chúng được render hoàn toàn ở phía client (CSR). Nếu cần đẩy mạnh SEO ở trang con, dự án có thể cân nhắc áp dụng Pre-rendering (SSG) hoặc cấu trúc thư mục chi tiết hơn trong tương lai.
