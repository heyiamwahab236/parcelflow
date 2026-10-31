CREATE TABLE shipments (
  tracking_number text PRIMARY KEY CHECK (tracking_number ~ '^PF-[A-F0-9]{16}$'),
  origin varchar(80) NOT NULL,
  destination varchar(80) NOT NULL,
  service text NOT NULL CHECK (service IN ('standard','express')),
  reference varchar(80) NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','picked_up','in_transit','out_for_delivery','delivered','delayed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_created_at_idx ON shipments (created_at DESC);
CREATE TABLE shipment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tracking_number text NOT NULL REFERENCES shipments(tracking_number),
  status text NOT NULL CHECK (status IN ('created','picked_up','in_transit','out_for_delivery','delivered','delayed')),
  location varchar(80) NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tracking_number, version)
);
