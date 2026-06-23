-- Store Daily Reporting & Analytics Database Schema
-- For use with PHP & MySQL shared hosting (phpMyAdmin)

CREATE TABLE IF NOT EXISTS `daily_reports` (
  `report_date` varchar(10) NOT NULL,
  `report_data` longtext NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
