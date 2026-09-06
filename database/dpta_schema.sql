-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: dpta
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `announcement`
--

DROP TABLE IF EXISTS `announcement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcement` (
  `announcement_id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned DEFAULT NULL,
  `title` varchar(160) NOT NULL,
  `body` varchar(500) DEFAULT NULL,
  `posted_by` int unsigned DEFAULT NULL,
  `effective_date` date DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`announcement_id`),
  KEY `fk_ann_project` (`project_id`),
  KEY `fk_ann_by` (`posted_by`),
  CONSTRAINT `fk_ann_by` FOREIGN KEY (`posted_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_ann_project` FOREIGN KEY (`project_id`) REFERENCES `project` (`project_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `app_setting`
--

DROP TABLE IF EXISTS `app_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_setting` (
  `setting_key` varchar(60) NOT NULL,
  `setting_value` varchar(300) NOT NULL,
  `description` varchar(200) DEFAULT NULL,
  `modified_by` int unsigned DEFAULT NULL,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`),
  KEY `fk_setting_user` (`modified_by`),
  CONSTRAINT `fk_setting_user` FOREIGN KEY (`modified_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `attendance`
--

DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance` (
  `attendance_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `att_date` date NOT NULL,
  `status_id` tinyint unsigned NOT NULL,
  `hours` decimal(4,1) NOT NULL DEFAULT '0.0',
  `note` varchar(200) DEFAULT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`attendance_id`),
  UNIQUE KEY `uq_attendance` (`user_id`,`att_date`),
  KEY `fk_att_status` (`status_id`),
  KEY `fk_att_appby` (`approved_by`),
  KEY `idx_att_date` (`att_date`),
  CONSTRAINT `fk_att_appby` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_att_status` FOREIGN KEY (`status_id`) REFERENCES `attendance_status` (`status_id`),
  CONSTRAINT `fk_att_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `attendance_status`
--

DROP TABLE IF EXISTS `attendance_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_status` (
  `status_id` tinyint unsigned NOT NULL,
  `code` varchar(30) NOT NULL,
  `name` varchar(40) NOT NULL,
  `counts_as_production_day` tinyint(1) NOT NULL DEFAULT '1',
  `is_leave` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`status_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `audit_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `action` varchar(80) NOT NULL,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_ref` varchar(80) DEFAULT NULL,
  `detail` varchar(500) DEFAULT NULL,
  `ip_address` varbinary(16) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_audit_time` (`created_at`),
  KEY `idx_audit_user` (`user_id`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `correction_request`
--

DROP TABLE IF EXISTS `correction_request`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `correction_request` (
  `request_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `entry_id` bigint unsigned DEFAULT NULL,
  `project_id` int unsigned NOT NULL,
  `production_date` date NOT NULL,
  `field_name` varchar(80) NOT NULL,
  `old_value` varchar(255) DEFAULT NULL,
  `new_value` varchar(255) DEFAULT NULL,
  `reason` varchar(500) NOT NULL,
  `requested_by` int unsigned NOT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status_id` tinyint unsigned NOT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approver_comments` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `fk_cr_entry` (`entry_id`),
  KEY `fk_cr_project` (`project_id`),
  KEY `fk_cr_appby` (`approved_by`),
  KEY `idx_cr_status` (`status_id`),
  KEY `idx_cr_reqby` (`requested_by`),
  CONSTRAINT `fk_cr_appby` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_cr_entry` FOREIGN KEY (`entry_id`) REFERENCES `daily_entry` (`entry_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cr_project` FOREIGN KEY (`project_id`) REFERENCES `project` (`project_id`),
  CONSTRAINT `fk_cr_reqby` FOREIGN KEY (`requested_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_cr_status` FOREIGN KEY (`status_id`) REFERENCES `correction_status` (`status_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `correction_status`
--

DROP TABLE IF EXISTS `correction_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `correction_status` (
  `status_id` tinyint unsigned NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(30) NOT NULL,
  PRIMARY KEY (`status_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `daily_entry`
--

DROP TABLE IF EXISTS `daily_entry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_entry` (
  `entry_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `production_date` date NOT NULL,
  `batch_ref` varchar(60) DEFAULT NULL,
  `category_id` smallint unsigned DEFAULT NULL,
  `docs_received` int unsigned NOT NULL DEFAULT '0',
  `docs_completed` int unsigned NOT NULL DEFAULT '0',
  `batches_processed` int unsigned NOT NULL DEFAULT '0',
  `errors_flagged` int unsigned NOT NULL DEFAULT '0',
  `remarks` varchar(500) DEFAULT NULL,
  `status_id` tinyint unsigned NOT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`entry_id`),
  UNIQUE KEY `uq_entry` (`user_id`,`project_id`,`production_date`,`batch_ref`),
  KEY `fk_entry_reviewer` (`reviewed_by`),
  KEY `fk_entry_cat` (`category_id`),
  KEY `idx_entry_date` (`production_date`),
  KEY `idx_entry_proj_date` (`project_id`,`production_date`),
  KEY `idx_entry_status` (`status_id`),
  CONSTRAINT `fk_entry_cat` FOREIGN KEY (`category_id`) REFERENCES `reporting_category` (`category_id`),
  CONSTRAINT `fk_entry_project` FOREIGN KEY (`project_id`) REFERENCES `project` (`project_id`),
  CONSTRAINT `fk_entry_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_entry_status` FOREIGN KEY (`status_id`) REFERENCES `entry_status` (`status_id`),
  CONSTRAINT `fk_entry_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `daily_entry_value`
--

DROP TABLE IF EXISTS `daily_entry_value`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_entry_value` (
  `entry_id` bigint unsigned NOT NULL,
  `field_id` int unsigned NOT NULL,
  `value_num` decimal(14,2) DEFAULT NULL,
  `value_txt` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`entry_id`,`field_id`),
  KEY `fk_dev_field` (`field_id`),
  CONSTRAINT `fk_dev_entry` FOREIGN KEY (`entry_id`) REFERENCES `daily_entry` (`entry_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dev_field` FOREIGN KEY (`field_id`) REFERENCES `project_field` (`field_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `department`
--

DROP TABLE IF EXISTS `department`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `department` (
  `department_id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entry_status`
--

DROP TABLE IF EXISTS `entry_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entry_status` (
  `status_id` tinyint unsigned NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(30) NOT NULL,
  `is_editable_by_indexer` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` tinyint unsigned NOT NULL,
  PRIMARY KEY (`status_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `guide`
--

DROP TABLE IF EXISTS `guide`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `guide` (
  `guide_id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `title` varchar(160) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`guide_id`),
  KEY `idx_guide_project` (`project_id`),
  CONSTRAINT `fk_guide_project` FOREIGN KEY (`project_id`) REFERENCES `project` (`project_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `guide_acknowledgement`
--

DROP TABLE IF EXISTS `guide_acknowledgement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `guide_acknowledgement` (
  `ack_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `version_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `status` enum('read','unread') NOT NULL DEFAULT 'unread',
  `acknowledged_at` datetime DEFAULT NULL,
  PRIMARY KEY (`ack_id`),
  UNIQUE KEY `uq_ack` (`version_id`,`user_id`),
  KEY `idx_ack_user` (`user_id`,`status`),
  CONSTRAINT `fk_ack_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ack_version` FOREIGN KEY (`version_id`) REFERENCES `guide_version` (`version_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=60 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `guide_section`
-- ============================================================
-- CUSTOM TABLE: guide_section
-- Added to store section-wise content for each guide version.
-- It allows Guide Manager to display and edit sections such as
-- Overview, General Guidelines, Indexing Rules, Field Mapping,
-- Examples, and Appendices dynamically for each guide version.
-- Connected to guide_version through version_id.
-- ============================================================
--

DROP TABLE IF EXISTS `guide_section`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `guide_section` (
  `section_id` int unsigned NOT NULL AUTO_INCREMENT,
  `version_id` int unsigned NOT NULL,
  `section_key` varchar(60) NOT NULL,
  `title` varchar(120) NOT NULL,
  `content` longtext NOT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT '1',
  PRIMARY KEY (`section_id`),
  UNIQUE KEY `uq_guide_section_key` (`version_id`,`section_key`),
  KEY `idx_guide_section_order` (`version_id`,`sort_order`),
  CONSTRAINT `fk_guide_section_version` FOREIGN KEY (`version_id`) REFERENCES `guide_version` (`version_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `guide_version`
--

DROP TABLE IF EXISTS `guide_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `guide_version` (
  `version_id` int unsigned NOT NULL AUTO_INCREMENT,
  `guide_id` int unsigned NOT NULL,
  `version_label` varchar(20) NOT NULL,
  `file_path` varchar(300) DEFAULT NULL,
  `change_summary` varchar(500) DEFAULT NULL,
  `is_latest` tinyint(1) NOT NULL DEFAULT '0',
  `requires_ack` tinyint(1) NOT NULL DEFAULT '1',
  `effective_date` date DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version_id`),
  UNIQUE KEY `uq_guide_version` (`guide_id`,`version_label`),
  KEY `fk_gv_upby` (`uploaded_by`),
  KEY `idx_gv_latest` (`guide_id`,`is_latest`),
  CONSTRAINT `fk_gv_guide` FOREIGN KEY (`guide_id`) REFERENCES `guide` (`guide_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gv_upby` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `leave_request`
-- ============================================================
-- CUSTOM TABLE: leave_request
-- Added to manage employee leave requests.
-- Stores leave type, start/end dates, reason, approval status,
-- reviewer details, review comments, and review timestamps.
-- Connected to users through user_id and reviewed_by.
-- ============================================================
--

DROP TABLE IF EXISTS `leave_request`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leave_request` (
  `leave_request_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `leave_type` varchar(80) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `reason` varchar(500) NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` int unsigned DEFAULT NULL,
  `review_comment` varchar(500) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`leave_request_id`),
  KEY `fk_leave_request_reviewer` (`reviewed_by`),
  KEY `idx_leave_request_user` (`user_id`),
  KEY `idx_leave_request_status` (`status`),
  KEY `idx_leave_request_dates` (`start_date`,`end_date`),
  CONSTRAINT `fk_leave_request_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leave_request_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `login_event`
--

DROP TABLE IF EXISTS `login_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_event` (
  `login_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `username_tried` varchar(60) DEFAULT NULL,
  `success` tinyint(1) NOT NULL,
  `method` enum('password','sso') NOT NULL DEFAULT 'password',
  `ip_address` varbinary(16) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`login_id`),
  KEY `idx_login_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_login_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=200 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notification`
--

DROP TABLE IF EXISTS `notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification` (
  `notification_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `type_id` smallint unsigned DEFAULT NULL,
  `title` varchar(160) NOT NULL,
  `body` varchar(500) DEFAULT NULL,
  `link_hash` varchar(80) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `fk_notif_type` (`type_id`),
  KEY `idx_notif_user` (`user_id`,`is_read`),
  CONSTRAINT `fk_notif_type` FOREIGN KEY (`type_id`) REFERENCES `notification_type` (`type_id`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notification_type`
--

DROP TABLE IF EXISTS `notification_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_type` (
  `type_id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(80) NOT NULL,
  `channel` enum('email','system','both') NOT NULL DEFAULT 'both',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`type_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `password_reset`
--

DROP TABLE IF EXISTS `password_reset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset` (
  `reset_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reset_id`),
  KEY `idx_reset_user` (`user_id`),
  CONSTRAINT `fk_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `production_target`
-- ============================================================
-- CUSTOM TABLE: production_target
-- Added to store monthly production targets for each project.
-- Used for Analytics & KPI calculations by comparing project
-- production targets with actual production data.
-- Connected to project through project_id.
-- ============================================================
--

DROP TABLE IF EXISTS `production_target`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_target` (
  `target_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `target_month` date NOT NULL,
  `target_docs` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`target_id`),
  UNIQUE KEY `uq_production_target_project_month` (`project_id`,`target_month`),
  KEY `idx_production_target_month` (`target_month`),
  CONSTRAINT `fk_production_target_project` FOREIGN KEY (`project_id`) REFERENCES `project` (`project_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project`
--

DROP TABLE IF EXISTS `project`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project` (
  `project_id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_code` varchar(20) NOT NULL,
  `project_name` varchar(120) NOT NULL,
  `client_name` varchar(120) DEFAULT NULL,
  `category_id` smallint unsigned DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `auto_lock_time` time DEFAULT NULL,
  `grace_minutes` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`),
  UNIQUE KEY `project_code` (`project_code`),
  KEY `fk_project_cat` (`category_id`),
  KEY `idx_project_status` (`status`),
  CONSTRAINT `fk_project_cat` FOREIGN KEY (`category_id`) REFERENCES `reporting_category` (`category_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_assignment`
--

DROP TABLE IF EXISTS `project_assignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_assignment` (
  `assignment_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `project_id` int unsigned NOT NULL,
  `assigned_by` int unsigned DEFAULT NULL,
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  UNIQUE KEY `uq_user_project` (`user_id`,`project_id`),
  KEY `fk_asg_by` (`assigned_by`),
  KEY `idx_asg_project` (`project_id`),
  CONSTRAINT `fk_asg_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_asg_project` FOREIGN KEY (`project_id`) REFERENCES `project` (`project_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_asg_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=264 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_field`
--

DROP TABLE IF EXISTS `project_field`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_field` (
  `field_id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `field_key` varchar(60) NOT NULL,
  `label` varchar(80) NOT NULL,
  `data_type` enum('int','decimal','text','date') NOT NULL DEFAULT 'int',
  `is_mandatory` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`field_id`),
  UNIQUE KEY `uq_project_field` (`project_id`,`field_key`),
  CONSTRAINT `fk_field_project` FOREIGN KEY (`project_id`) REFERENCES `project` (`project_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reporting_category`
--

DROP TABLE IF EXISTS `reporting_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reporting_category` (
  `category_id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `role`
--

DROP TABLE IF EXISTS `role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role` (
  `role_id` tinyint unsigned NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(50) NOT NULL,
  `sees_all_projects` tinyint(1) NOT NULL DEFAULT '0',
  `can_approve_corrections` tinyint(1) NOT NULL DEFAULT '0',
  `rank_order` tinyint unsigned NOT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int unsigned NOT NULL AUTO_INCREMENT,
  `emp_code` varchar(20) NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `username` varchar(60) NOT NULL,
  `email` varchar(160) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `auth_method` enum('password','sso','both') NOT NULL DEFAULT 'both',
  `department_id` smallint unsigned DEFAULT NULL,
  `designation` varchar(80) DEFAULT NULL,
  `role_id` tinyint unsigned NOT NULL,
  `team_lead_id` int unsigned DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `emp_code` (`emp_code`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_user_dept` (`department_id`),
  KEY `idx_user_role` (`role_id`),
  KEY `idx_user_lead` (`team_lead_id`),
  KEY `idx_user_status` (`status`),
  CONSTRAINT `fk_user_dept` FOREIGN KEY (`department_id`) REFERENCES `department` (`department_id`),
  CONSTRAINT `fk_user_lead` FOREIGN KEY (`team_lead_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`role_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `v_guide_compliance`
--

DROP TABLE IF EXISTS `v_guide_compliance`;
/*!50001 DROP VIEW IF EXISTS `v_guide_compliance`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_guide_compliance` AS SELECT 
 1 AS `project_id`,
 1 AS `project_name`,
 1 AS `version_id`,
 1 AS `version_label`,
 1 AS `total_targeted`,
 1 AS `acknowledged`,
 1 AS `pending`,
 1 AS `compliance_pct`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_pending_corrections`
--

DROP TABLE IF EXISTS `v_pending_corrections`;
/*!50001 DROP VIEW IF EXISTS `v_pending_corrections`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_pending_corrections` AS SELECT 
 1 AS `request_id`,
 1 AS `project_name`,
 1 AS `production_date`,
 1 AS `field_name`,
 1 AS `old_value`,
 1 AS `new_value`,
 1 AS `reason`,
 1 AS `requested_by`,
 1 AS `requested_at`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_production_summary`
--

DROP TABLE IF EXISTS `v_production_summary`;
/*!50001 DROP VIEW IF EXISTS `v_production_summary`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_production_summary` AS SELECT 
 1 AS `user_id`,
 1 AS `full_name`,
 1 AS `project_id`,
 1 AS `project_name`,
 1 AS `production_date`,
 1 AS `received`,
 1 AS `completed`,
 1 AS `pending`,
 1 AS `productivity_pct`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_user_visible_project`
--

DROP TABLE IF EXISTS `v_user_visible_project`;
/*!50001 DROP VIEW IF EXISTS `v_user_visible_project`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_user_visible_project` AS SELECT 
 1 AS `user_id`,
 1 AS `project_id`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `v_guide_compliance`
--

/*!50001 DROP VIEW IF EXISTS `v_guide_compliance`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_guide_compliance` AS select `g`.`project_id` AS `project_id`,`p`.`project_name` AS `project_name`,`gv`.`version_id` AS `version_id`,`gv`.`version_label` AS `version_label`,count(`ga`.`ack_id`) AS `total_targeted`,sum((`ga`.`status` = 'read')) AS `acknowledged`,sum((`ga`.`status` = 'unread')) AS `pending`,round(((100 * sum((`ga`.`status` = 'read'))) / nullif(count(`ga`.`ack_id`),0)),0) AS `compliance_pct` from (((`guide_version` `gv` join `guide` `g` on((`g`.`guide_id` = `gv`.`guide_id`))) join `project` `p` on((`p`.`project_id` = `g`.`project_id`))) left join `guide_acknowledgement` `ga` on((`ga`.`version_id` = `gv`.`version_id`))) where (`gv`.`is_latest` = 1) group by `g`.`project_id`,`p`.`project_name`,`gv`.`version_id`,`gv`.`version_label` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_pending_corrections`
--

/*!50001 DROP VIEW IF EXISTS `v_pending_corrections`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_pending_corrections` AS select `cr`.`request_id` AS `request_id`,`p`.`project_name` AS `project_name`,`cr`.`production_date` AS `production_date`,`cr`.`field_name` AS `field_name`,`cr`.`old_value` AS `old_value`,`cr`.`new_value` AS `new_value`,`cr`.`reason` AS `reason`,`ru`.`full_name` AS `requested_by`,`cr`.`requested_at` AS `requested_at` from (((`correction_request` `cr` join `project` `p` on((`p`.`project_id` = `cr`.`project_id`))) join `users` `ru` on((`ru`.`user_id` = `cr`.`requested_by`))) join `correction_status` `cs` on((`cs`.`status_id` = `cr`.`status_id`))) where (`cs`.`code` = 'pending') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_production_summary`
--

/*!50001 DROP VIEW IF EXISTS `v_production_summary`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_production_summary` AS select `de`.`user_id` AS `user_id`,`u`.`full_name` AS `full_name`,`de`.`project_id` AS `project_id`,`p`.`project_name` AS `project_name`,`de`.`production_date` AS `production_date`,sum(`de`.`docs_received`) AS `received`,sum(`de`.`docs_completed`) AS `completed`,(sum(`de`.`docs_received`) - sum(`de`.`docs_completed`)) AS `pending`,round(((100 * sum(`de`.`docs_completed`)) / nullif(sum(`de`.`docs_received`),0)),1) AS `productivity_pct` from ((`daily_entry` `de` join `users` `u` on((`u`.`user_id` = `de`.`user_id`))) join `project` `p` on((`p`.`project_id` = `de`.`project_id`))) group by `de`.`user_id`,`u`.`full_name`,`de`.`project_id`,`p`.`project_name`,`de`.`production_date` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_user_visible_project`
--

/*!50001 DROP VIEW IF EXISTS `v_user_visible_project`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_user_visible_project` AS select `u`.`user_id` AS `user_id`,`p`.`project_id` AS `project_id` from ((`users` `u` join `role` `r` on((`r`.`role_id` = `u`.`role_id`))) join `project` `p` on((`r`.`sees_all_projects` = 1))) union select `pa`.`user_id` AS `user_id`,`pa`.`project_id` AS `project_id` from `project_assignment` `pa` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-06 21:05:05
