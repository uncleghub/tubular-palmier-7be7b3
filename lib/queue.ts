import { pool } from "./db";
export async function reconcileLostLeases() {
  return pool.query(
    "UPDATE jobs SET state='uncertain',error='Processing interrupted; reconciliation required',updated_at=now() WHERE state='running' AND lease_until<now() RETURNING id",
  );
}
