"""Blueprint API: health, auth, user, produk, kategori, stok, penjualan, struk, upload, audit."""

from dagang.api.audit import bp as audit_bp
from dagang.api.auth import bp as auth_bp
from dagang.api.auth import register_jwt_handlers
from dagang.api.categories import bp as categories_bp
from dagang.api.health import bp as health_bp
from dagang.api.opname import bp as opname_bp
from dagang.api.pengeluaran import bp as pengeluaran_bp
from dagang.api.products import bp as products_bp
from dagang.api.receipt import bp as receipt_bp
from dagang.api.reports import bp as reports_bp
from dagang.api.sales import bp as sales_bp
from dagang.api.shifts import bp as shifts_bp
from dagang.api.stock import bp as stock_bp
from dagang.api.uploads import bp as uploads_bp
from dagang.api.users import bp as users_bp


def register_blueprints(app) -> None:
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(products_bp)
    app.register_blueprint(categories_bp)
    app.register_blueprint(stock_bp)
    app.register_blueprint(opname_bp)
    app.register_blueprint(pengeluaran_bp)
    app.register_blueprint(sales_bp)
    app.register_blueprint(shifts_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(receipt_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(audit_bp)
    register_jwt_handlers(app)
