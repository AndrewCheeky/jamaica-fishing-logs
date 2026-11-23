-- Optional approximate total weight (lb) for each species line on a trip.
-- Marlin: estimated fish weight. Bottom fishing (e.g. snapper): total weight of that species.
ALTER TABLE catches ADD COLUMN weight_lb REAL;
