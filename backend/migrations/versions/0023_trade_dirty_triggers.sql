CREATE OR REPLACE FUNCTION trades_mark_dirty() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF COALESCE(OLD.position_id, 0) <> 0 THEN
            INSERT INTO trade_dirty_positions(account_login, position_id)
            VALUES (OLD.account_login, OLD.position_id)
            ON CONFLICT DO NOTHING;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE'
       AND COALESCE(OLD.position_id, 0) <> 0
       AND (OLD.account_login, OLD.position_id) IS DISTINCT FROM (NEW.account_login, NEW.position_id) THEN
        INSERT INTO trade_dirty_positions(account_login, position_id)
        VALUES (OLD.account_login, OLD.position_id)
        ON CONFLICT DO NOTHING;
    END IF;

    IF COALESCE(NEW.position_id, 0) <> 0 THEN
        INSERT INTO trade_dirty_positions(account_login, position_id)
        VALUES (NEW.account_login, NEW.position_id)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trades_dirty ON deals;
CREATE TRIGGER trades_dirty
AFTER INSERT OR UPDATE OR DELETE ON deals
FOR EACH ROW EXECUTE FUNCTION trades_mark_dirty();

INSERT INTO trade_dirty_positions(account_login, position_id)
SELECT DISTINCT account_login, position_id
  FROM deals
 WHERE COALESCE(position_id, 0) <> 0
ON CONFLICT DO NOTHING;