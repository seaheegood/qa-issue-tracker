-- CreateTable
CREATE TABLE `projects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(10) NOT NULL,
    `issue_prefix` VARCHAR(10) NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `issue_seq` INTEGER NOT NULL DEFAULT 0,
    `started_at` DATE NULL,
    `ended_at` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `projects_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `color` VARCHAR(7) NOT NULL,
    `role` ENUM('LEAD', 'QA', 'DEV', 'PLANNER') NULL,
    `description` VARCHAR(200) NULL,
    `sort_order` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teams_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `login_id` VARCHAR(50) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NULL,
    `password_hash` VARCHAR(255) NULL,
    `system_role` ENUM('ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `team_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_login_id_key`(`login_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` CHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sessions_user_id_idx`(`user_id`),
    INDEX `sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `issue_statuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `category` ENUM('OPEN', 'RESOLVED', 'CLOSED', 'PENDING') NOT NULL,
    `color` VARCHAR(7) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `is_initial` BOOLEAN NOT NULL DEFAULT false,
    `is_terminal` BOOLEAN NOT NULL DEFAULT false,
    `require_note` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `issue_statuses_project_id_code_key`(`project_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `status_transitions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `from_status_id` INTEGER NOT NULL,
    `to_status_id` INTEGER NOT NULL,
    `allowed_roles` JSON NULL,
    `require_note` BOOLEAN NOT NULL DEFAULT false,
    `note_label` VARCHAR(30) NULL,
    `note_hint` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `status_transitions_project_id_from_status_id_idx`(`project_id`, `from_status_id`),
    UNIQUE INDEX `status_transitions_project_id_from_status_id_to_status_id_key`(`project_id`, `from_status_id`, `to_status_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rounds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `started_on` DATE NULL,
    `ended_on` DATE NULL,
    `sort_order` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `rounds_project_id_code_key`(`project_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platforms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `platforms_project_id_code_key`(`project_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `priorities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `color` VARCHAR(7) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `priorities_project_id_code_key`(`project_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `environments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `environments_project_id_code_key`(`project_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `systems` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `code` VARCHAR(2) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `user_type` ENUM('OPERATOR', 'SELLER', 'CUSTOMER') NOT NULL DEFAULT 'OPERATOR',
    `platform` ENUM('WEB', 'APP', 'API') NOT NULL DEFAULT 'WEB',
    `description` TEXT NULL,
    `base_url` VARCHAR(255) NULL,
    `sort_order` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `systems_project_id_code_key`(`project_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `issues` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `priority_id` INTEGER NOT NULL,
    `environment_id` INTEGER NOT NULL,
    `system_id` INTEGER NOT NULL,
    `legacy_screen_name` VARCHAR(200) NULL,
    `title` VARCHAR(200) NOT NULL,
    `test_path` TEXT NULL,
    `content` TEXT NULL,
    `expected` TEXT NULL,
    `external_ref` VARCHAR(50) NULL,
    `jira_key` VARCHAR(30) NULL,
    `jira_sent_at` DATETIME(3) NULL,
    `jira_sent_by` INTEGER NULL,
    `repro_rate` ENUM('ALWAYS', 'INTERMITTENT', 'ONCE') NULL,
    `reporter_id` INTEGER NOT NULL,
    `reported_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `deleted_by` INTEGER NULL,
    `status_id` INTEGER NOT NULL,
    `assignee_id` INTEGER NULL,
    `round_id` INTEGER NULL,
    `found_version` VARCHAR(50) NULL,
    `fixed_version` VARCHAR(50) NULL,
    `resolved_at` DATETIME(3) NULL,
    `close_reason` ENUM('QA_CONFIRMED', 'NOT_AN_ISSUE', 'DUPLICATE', 'ON_HOLD') NULL,
    `answered_by_id` INTEGER NULL,
    `answered_by_role` ENUM('LEAD', 'QA', 'DEV', 'PLANNER') NULL,
    `answered_at` DATETIME(3) NULL,
    `status_changed_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `issues_project_id_status_id_idx`(`project_id`, `status_id`),
    INDEX `issues_project_id_system_id_idx`(`project_id`, `system_id`),
    INDEX `issues_project_id_assignee_id_status_id_idx`(`project_id`, `assignee_id`, `status_id`),
    INDEX `issues_project_id_reporter_id_idx`(`project_id`, `reporter_id`),
    INDEX `issues_project_id_reported_at_idx`(`project_id`, `reported_at`),
    INDEX `issues_project_id_updated_at_idx`(`project_id`, `updated_at`),
    INDEX `issues_project_id_created_at_idx`(`project_id`, `created_at`),
    INDEX `issues_project_id_deleted_at_idx`(`project_id`, `deleted_at`),
    INDEX `issues_project_id_priority_id_status_id_idx`(`project_id`, `priority_id`, `status_id`),
    INDEX `issues_project_id_round_id_idx`(`project_id`, `round_id`),
    INDEX `issues_assignee_id_status_id_idx`(`assignee_id`, `status_id`),
    UNIQUE INDEX `issues_project_id_seq_key`(`project_id`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `issue_platforms` (
    `issue_id` INTEGER NOT NULL,
    `platform_id` INTEGER NOT NULL,

    INDEX `issue_platforms_platform_id_idx`(`platform_id`),
    PRIMARY KEY (`issue_id`, `platform_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `issue_relations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `from_issue_id` INTEGER NOT NULL,
    `to_issue_id` INTEGER NOT NULL,
    `type` ENUM('DUPLICATE', 'PRECEDES', 'DERIVES') NOT NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `issue_relations_to_issue_id_idx`(`to_issue_id`),
    UNIQUE INDEX `issue_relations_from_issue_id_to_issue_id_type_key`(`from_issue_id`, `to_issue_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issue_id` INTEGER NULL,
    `comment_id` INTEGER NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `stored_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `uploaded_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attachments_issue_id_idx`(`issue_id`),
    INDEX `attachments_comment_id_idx`(`comment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_blobs` (
    `path` VARCHAR(500) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`path`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `issue_histories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issue_id` INTEGER NOT NULL,
    `field` VARCHAR(30) NOT NULL,
    `old_value` TEXT NULL,
    `new_value` TEXT NULL,
    `changed_by` INTEGER NOT NULL,
    `changed_by_role` ENUM('LEAD', 'QA', 'DEV', 'PLANNER') NULL,
    `note` TEXT NULL,
    `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `issue_histories_issue_id_changed_at_idx`(`issue_id`, `changed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issue_id` INTEGER NOT NULL,
    `type` ENUM('DEV', 'PLAN', 'QA') NOT NULL,
    `author_id` INTEGER NOT NULL,
    `body` LONGTEXT NOT NULL,
    `is_edited` BOOLEAN NOT NULL DEFAULT false,
    `legacy_last_author_id` INTEGER NULL,
    `parent_id` INTEGER NULL,
    `legacy_raw` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `comments_issue_id_created_at_idx`(`issue_id`, `created_at`),
    INDEX `comments_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saved_filters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `query` TEXT NOT NULL,
    `is_shared` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `saved_filters_project_id_is_shared_idx`(`project_id`, `is_shared`),
    UNIQUE INDEX `saved_filters_owner_id_name_key`(`owner_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `issue_watchers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issue_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `muted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `issue_watchers_user_id_idx`(`user_id`),
    UNIQUE INDEX `issue_watchers_issue_id_user_id_key`(`issue_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `actor_id` INTEGER NOT NULL,
    `issue_id` INTEGER NOT NULL,
    `kind` ENUM('STATUS', 'CLOSED', 'COMMENT', 'ASSIGNED', 'MENTION') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `href` VARCHAR(500) NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_read_at_idx`(`user_id`, `read_at`),
    INDEX `notifications_issue_id_idx`(`issue_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `issue_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `test_path` TEXT NULL,
    `expected` TEXT NULL,
    `found_version` VARCHAR(50) NULL,
    `screen_name` VARCHAR(255) NULL,
    `round_id` INTEGER NULL,
    `priority_id` INTEGER NULL,
    `environment_id` INTEGER NULL,
    `system_id` INTEGER NULL,
    `platform_codes` JSON NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `issue_templates_project_id_is_active_idx`(`project_id`, `is_active`),
    UNIQUE INDEX `issue_templates_project_id_name_key`(`project_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imported_lists` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `source_file` VARCHAR(255) NOT NULL,
    `sheet_name` VARCHAR(200) NOT NULL,
    `header_row` INTEGER NOT NULL,
    `data_row` INTEGER NOT NULL,
    `row_count` INTEGER NOT NULL,
    `note` TEXT NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `defaults` JSON NULL,
    `target_project_id` INTEGER NULL,
    `target_round_id` INTEGER NULL,
    `committed_at` DATETIME(3) NULL,
    `committed_by_id` INTEGER NULL,

    INDEX `imported_lists_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imported_columns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `list_id` INTEGER NOT NULL,
    `source_index` INTEGER NOT NULL,
    `source_header` VARCHAR(255) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `is_selected` BOOLEAN NOT NULL DEFAULT true,
    `target_field` VARCHAR(40) NULL,
    `value_map` JSON NULL,
    `sort_order` INTEGER NOT NULL,

    INDEX `imported_columns_list_id_sort_order_idx`(`list_id`, `sort_order`),
    UNIQUE INDEX `imported_columns_list_id_source_index_key`(`list_id`, `source_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imported_rows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `list_id` INTEGER NOT NULL,
    `row_no` INTEGER NOT NULL,
    `cells` JSON NOT NULL,
    `issue_id` INTEGER NULL,
    `import_error` TEXT NULL,

    UNIQUE INDEX `imported_rows_issue_id_key`(`issue_id`),
    UNIQUE INDEX `imported_rows_list_id_row_no_key`(`list_id`, `row_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jira_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `base_url` VARCHAR(200) NOT NULL,
    `jira_project_key` VARCHAR(20) NOT NULL,
    `issue_type_id` VARCHAR(20) NOT NULL,
    `labels` VARCHAR(200) NULL,
    `category_field_id` VARCHAR(40) NULL,
    `category_value` VARCHAR(100) NULL,
    `default_parent_key` VARCHAR(30) NULL,
    `priority_map` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `jira_settings_project_id_key`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedbacks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `page` VARCHAR(500) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checked_at` DATETIME(3) NULL,
    `checked_by_id` INTEGER NULL,

    INDEX `feedbacks_checked_at_idx`(`checked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_statuses` ADD CONSTRAINT `issue_statuses_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `status_transitions` ADD CONSTRAINT `status_transitions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `status_transitions` ADD CONSTRAINT `status_transitions_from_status_id_fkey` FOREIGN KEY (`from_status_id`) REFERENCES `issue_statuses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `status_transitions` ADD CONSTRAINT `status_transitions_to_status_id_fkey` FOREIGN KEY (`to_status_id`) REFERENCES `issue_statuses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rounds` ADD CONSTRAINT `rounds_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platforms` ADD CONSTRAINT `platforms_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `priorities` ADD CONSTRAINT `priorities_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `environments` ADD CONSTRAINT `environments_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `systems` ADD CONSTRAINT `systems_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_priority_id_fkey` FOREIGN KEY (`priority_id`) REFERENCES `priorities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_environment_id_fkey` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_system_id_fkey` FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_status_id_fkey` FOREIGN KEY (`status_id`) REFERENCES `issue_statuses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_reporter_id_fkey` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_assignee_id_fkey` FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_deleted_by_fkey` FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_answered_by_id_fkey` FOREIGN KEY (`answered_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_jira_sent_by_fkey` FOREIGN KEY (`jira_sent_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issues` ADD CONSTRAINT `issues_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_platforms` ADD CONSTRAINT `issue_platforms_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_platforms` ADD CONSTRAINT `issue_platforms_platform_id_fkey` FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_relations` ADD CONSTRAINT `issue_relations_from_issue_id_fkey` FOREIGN KEY (`from_issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_relations` ADD CONSTRAINT `issue_relations_to_issue_id_fkey` FOREIGN KEY (`to_issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_relations` ADD CONSTRAINT `issue_relations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_histories` ADD CONSTRAINT `issue_histories_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_histories` ADD CONSTRAINT `issue_histories_changed_by_fkey` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_legacy_last_author_id_fkey` FOREIGN KEY (`legacy_last_author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_filters` ADD CONSTRAINT `saved_filters_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_filters` ADD CONSTRAINT `saved_filters_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_watchers` ADD CONSTRAINT `issue_watchers_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_watchers` ADD CONSTRAINT `issue_watchers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_templates` ADD CONSTRAINT `issue_templates_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_templates` ADD CONSTRAINT `issue_templates_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_templates` ADD CONSTRAINT `issue_templates_priority_id_fkey` FOREIGN KEY (`priority_id`) REFERENCES `priorities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_templates` ADD CONSTRAINT `issue_templates_environment_id_fkey` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue_templates` ADD CONSTRAINT `issue_templates_system_id_fkey` FOREIGN KEY (`system_id`) REFERENCES `systems`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imported_lists` ADD CONSTRAINT `imported_lists_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imported_lists` ADD CONSTRAINT `imported_lists_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imported_columns` ADD CONSTRAINT `imported_columns_list_id_fkey` FOREIGN KEY (`list_id`) REFERENCES `imported_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imported_rows` ADD CONSTRAINT `imported_rows_list_id_fkey` FOREIGN KEY (`list_id`) REFERENCES `imported_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imported_rows` ADD CONSTRAINT `imported_rows_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jira_settings` ADD CONSTRAINT `jira_settings_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_checked_by_id_fkey` FOREIGN KEY (`checked_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

