-- Analytics: time-bucketed reports filter confirmed sales/credits by confirmed_at
CREATE INDEX "orders_confirmed_at_idx" ON "orders"("confirmed_at" DESC);
