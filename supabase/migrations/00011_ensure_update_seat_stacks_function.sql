-- Ensure update_seat_stacks RPC exists even if 00010 was marked applied via history repair.
CREATE OR REPLACE FUNCTION update_seat_stacks(p_table_id TEXT, p_stacks JSONB)
RETURNS INT
LANGUAGE sql
AS $$
  WITH updated AS (
    UPDATE seats s
    SET stack = v.stack
    FROM (
      SELECT (elem->>'seatId')::int AS seat_id, (elem->>'stack')::int AS stack
      FROM jsonb_array_elements(p_stacks) AS elem
    ) v
    WHERE s.table_id = p_table_id AND s.seat_id = v.seat_id
    RETURNING 1
  )
  SELECT COALESCE((SELECT COUNT(*)::int FROM updated), 0);
$$;

COMMENT ON FUNCTION update_seat_stacks(TEXT, JSONB) IS 'Batch-update seat stacks for a table; returns number of rows updated';
