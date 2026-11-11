PRAGMA foreign_keys=ON;
CREATE TABLE weekly_categories(name TEXT PRIMARY KEY, color TEXT NOT NULL, bg TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE weekly_events(id TEXT PRIMARY KEY, weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6), category TEXT NOT NULL REFERENCES weekly_categories(name) ON UPDATE CASCADE ON DELETE RESTRICT, title TEXT NOT NULL, start_time TEXT, end_time TEXT, location TEXT, contact_person TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE monthly_announcements(id TEXT PRIMARY KEY,title TEXT NOT NULL,publish_date TEXT,start_date TEXT NOT NULL,end_date TEXT,category TEXT REFERENCES weekly_categories(name) ON UPDATE CASCADE ON DELETE RESTRICT,start_time TEXT,end_time TEXT,location TEXT,content TEXT,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK(end_date IS NULL OR end_date>=start_date),CHECK(publish_date IS NULL OR publish_date<=COALESCE(end_date,start_date)));
CREATE INDEX notice_dates ON monthly_announcements(publish_date,end_date,start_date);
CREATE INDEX weekly_day ON weekly_events(weekday,start_time);
CREATE TABLE login_attempts(id TEXT PRIMARY KEY, attempted_at INTEGER NOT NULL);
CREATE INDEX login_time ON login_attempts(attempted_at);
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT INTO settings VALUES('migration_pending','1');
INSERT INTO weekly_categories VALUES
('全教會','#78B54C','#EDF6E6',1),('區','#A68BD5','#F1ECFA',2),('親主Team','#C18B12','#FFF3CD',3),('周間小組','#E0A316','#FFF7DC',4),('愛筵','#F0BD4E','#FFF9E9',5),('學生聚會','#1698D0','#E6F5FC',6),('同工相聚','#E47772','#FCECEB',7),('預工','#7C9C9A','#EAF2F1',8);
