export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      class: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          starts_at: string
          updated_at: string
          workshop_id: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          starts_at: string
          updated_at?: string
          workshop_id?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          starts_at?: string
          updated_at?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshop"
            referencedColumns: ["id"]
          },
        ]
      }
      class_attendance: {
        Row: {
          camera_on: boolean | null
          class_id: string
          created_at: string
          gift_card_block_reason: string | null
          gift_card_blocked: boolean
          gift_card_blocked_at: string | null
          gift_card_blocked_by: string | null
          id: string
          notes: string | null
          photo_status:
            | Database["public"]["Enums"]["class_attendance_photo_status"]
            | null
          profile_id: string
          recorded_by: string | null
          status: Database["public"]["Enums"]["class_attendance_status"] | null
          updated_at: string
        }
        Insert: {
          camera_on?: boolean | null
          class_id: string
          created_at?: string
          gift_card_block_reason?: string | null
          gift_card_blocked?: boolean
          gift_card_blocked_at?: string | null
          gift_card_blocked_by?: string | null
          id?: string
          notes?: string | null
          photo_status?:
            | Database["public"]["Enums"]["class_attendance_photo_status"]
            | null
          profile_id: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["class_attendance_status"] | null
          updated_at?: string
        }
        Update: {
          camera_on?: boolean | null
          class_id?: string
          created_at?: string
          gift_card_block_reason?: string | null
          gift_card_blocked?: boolean
          gift_card_blocked_at?: string | null
          gift_card_blocked_by?: string | null
          id?: string
          notes?: string | null
          photo_status?:
            | Database["public"]["Enums"]["class_attendance_photo_status"]
            | null
          profile_id?: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["class_attendance_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      class_zoom_meeting: {
        Row: {
          class_id: string
          created_at: string
          duration_minutes: number | null
          error_message: string | null
          host_zoom_user_email: string | null
          host_zoom_user_id: string | null
          id: string
          join_url: string | null
          last_synced_at: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["zoom_meeting_status"]
          topic: string | null
          updated_at: string
          zoom_host_id: string
          zoom_meeting_id: string | null
          zoom_meeting_uuid: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          duration_minutes?: number | null
          error_message?: string | null
          host_zoom_user_email?: string | null
          host_zoom_user_id?: string | null
          id?: string
          join_url?: string | null
          last_synced_at?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["zoom_meeting_status"]
          topic?: string | null
          updated_at?: string
          zoom_host_id: string
          zoom_meeting_id?: string | null
          zoom_meeting_uuid?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          duration_minutes?: number | null
          error_message?: string | null
          host_zoom_user_email?: string | null
          host_zoom_user_id?: string | null
          id?: string
          join_url?: string | null
          last_synced_at?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["zoom_meeting_status"]
          topic?: string | null
          updated_at?: string
          zoom_host_id?: string
          zoom_meeting_id?: string | null
          zoom_meeting_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_zoom_meeting_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_zoom_meeting_zoom_host_id_fkey"
            columns: ["zoom_host_id"]
            isOneToOne: false
            referencedRelation: "zoom_host"
            referencedColumns: ["id"]
          },
        ]
      }
      class_zoom_participant: {
        Row: {
          attentiveness_score: number | null
          camera_on: boolean | null
          class_id: string
          class_zoom_meeting_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          join_time: string | null
          leave_time: string | null
          profile_id: string | null
          raw: Json
          user_email: string | null
          user_name: string | null
          zoom_user_id: string | null
        }
        Insert: {
          attentiveness_score?: number | null
          camera_on?: boolean | null
          class_id: string
          class_zoom_meeting_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          join_time?: string | null
          leave_time?: string | null
          profile_id?: string | null
          raw?: Json
          user_email?: string | null
          user_name?: string | null
          zoom_user_id?: string | null
        }
        Update: {
          attentiveness_score?: number | null
          camera_on?: boolean | null
          class_id?: string
          class_zoom_meeting_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          join_time?: string | null
          leave_time?: string | null
          profile_id?: string | null
          raw?: Json
          user_email?: string | null
          user_name?: string | null
          zoom_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_zoom_participant_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_zoom_participant_class_zoom_meeting_id_fkey"
            columns: ["class_zoom_meeting_id"]
            isOneToOne: false
            referencedRelation: "class_zoom_meeting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_zoom_participant_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      class_zoom_participant_sync: {
        Row: {
          class_zoom_meeting_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          payload: Json
          started_at: string | null
          status: Database["public"]["Enums"]["zoom_sync_status"]
        }
        Insert: {
          class_zoom_meeting_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["zoom_sync_status"]
        }
        Update: {
          class_zoom_meeting_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["zoom_sync_status"]
        }
        Relationships: [
          {
            foreignKeyName: "class_zoom_participant_sync_class_zoom_meeting_id_fkey"
            columns: ["class_zoom_meeting_id"]
            isOneToOne: false
            referencedRelation: "class_zoom_meeting"
            referencedColumns: ["id"]
          },
        ]
      }
      class_zoom_registrant: {
        Row: {
          class_id: string
          class_zoom_meeting_id: string
          created_at: string
          id: string
          last_sent_at: string | null
          profile_id: string
          updated_at: string
          zlr_expires_at: string | null
          zlr_token_hash: string
          zoom_join_url: string | null
          zoom_registrant_id: string | null
        }
        Insert: {
          class_id: string
          class_zoom_meeting_id: string
          created_at?: string
          id?: string
          last_sent_at?: string | null
          profile_id: string
          updated_at?: string
          zlr_expires_at?: string | null
          zlr_token_hash: string
          zoom_join_url?: string | null
          zoom_registrant_id?: string | null
        }
        Update: {
          class_id?: string
          class_zoom_meeting_id?: string
          created_at?: string
          id?: string
          last_sent_at?: string | null
          profile_id?: string
          updated_at?: string
          zlr_expires_at?: string | null
          zlr_token_hash?: string
          zoom_join_url?: string | null
          zoom_registrant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_zoom_registrant_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_zoom_registrant_class_zoom_meeting_id_fkey"
            columns: ["class_zoom_meeting_id"]
            isOneToOne: false
            referencedRelation: "class_zoom_meeting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_zoom_registrant_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      email_draft: {
        Row: {
          channel: Database["public"]["Enums"]["email_draft_channel"]
          created_at: string
          created_by_user_id: string | null
          current_body_markdown: string
          current_subject_markdown: string
          description: string | null
          draft_key: string
          id: string
          is_system: boolean
          published_version_id: string | null
          status: Database["public"]["Enums"]["email_draft_status"]
          title: string
          trigger_event_key: string | null
          trigger_owner: string | null
          trigger_summary: string
          updated_at: string
          updated_by_user_id: string | null
          variables_schema: Json
        }
        Insert: {
          channel: Database["public"]["Enums"]["email_draft_channel"]
          created_at?: string
          created_by_user_id?: string | null
          current_body_markdown?: string
          current_subject_markdown?: string
          description?: string | null
          draft_key: string
          id?: string
          is_system?: boolean
          published_version_id?: string | null
          status?: Database["public"]["Enums"]["email_draft_status"]
          title: string
          trigger_event_key?: string | null
          trigger_owner?: string | null
          trigger_summary?: string
          updated_at?: string
          updated_by_user_id?: string | null
          variables_schema?: Json
        }
        Update: {
          channel?: Database["public"]["Enums"]["email_draft_channel"]
          created_at?: string
          created_by_user_id?: string | null
          current_body_markdown?: string
          current_subject_markdown?: string
          description?: string | null
          draft_key?: string
          id?: string
          is_system?: boolean
          published_version_id?: string | null
          status?: Database["public"]["Enums"]["email_draft_status"]
          title?: string
          trigger_event_key?: string | null
          trigger_owner?: string | null
          trigger_summary?: string
          updated_at?: string
          updated_by_user_id?: string | null
          variables_schema?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_draft_published_version_id_fkey"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "email_draft_version"
            referencedColumns: ["id"]
          },
        ]
      }
      email_draft_version: {
        Row: {
          body_markdown: string
          change_note: string | null
          created_at: string
          created_by_user_id: string | null
          email_draft_id: string
          html_rendered: string
          id: string
          published_at: string | null
          published_by_user_id: string | null
          subject_markdown: string
          subject_rendered: string
          text_rendered: string
          variables_schema: Json
          version_number: number
        }
        Insert: {
          body_markdown: string
          change_note?: string | null
          created_at?: string
          created_by_user_id?: string | null
          email_draft_id: string
          html_rendered: string
          id?: string
          published_at?: string | null
          published_by_user_id?: string | null
          subject_markdown: string
          subject_rendered: string
          text_rendered: string
          variables_schema?: Json
          version_number: number
        }
        Update: {
          body_markdown?: string
          change_note?: string | null
          created_at?: string
          created_by_user_id?: string | null
          email_draft_id?: string
          html_rendered?: string
          id?: string
          published_at?: string | null
          published_by_user_id?: string | null
          subject_markdown?: string
          subject_rendered?: string
          text_rendered?: string
          variables_schema?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_draft_version_email_draft_id_fkey"
            columns: ["email_draft_id"]
            isOneToOne: false
            referencedRelation: "email_draft"
            referencedColumns: ["id"]
          },
        ]
      }
      email_message: {
        Row: {
          created_at: string
          error_message: string | null
          event_key: string | null
          failed_at: string | null
          family_profile_id: string | null
          id: string
          profile_id: string | null
          provider: string
          provider_message_id: string | null
          recipient_user_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_message_status"]
          subject: string
          template_data: Json
          template_key: string
          to_email: string
          triggered_by_user_id: string | null
          updated_at: string
          workshop_enrollment_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_key?: string | null
          failed_at?: string | null
          family_profile_id?: string | null
          id?: string
          profile_id?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_message_status"]
          subject: string
          template_data?: Json
          template_key: string
          to_email: string
          triggered_by_user_id?: string | null
          updated_at?: string
          workshop_enrollment_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_key?: string | null
          failed_at?: string | null
          family_profile_id?: string | null
          id?: string
          profile_id?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_message_status"]
          subject?: string
          template_data?: Json
          template_key?: string
          to_email?: string
          triggered_by_user_id?: string | null
          updated_at?: string
          workshop_enrollment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_message_family_profile_id_fkey"
            columns: ["family_profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_message_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_message_workshop_enrollment_id_fkey"
            columns: ["workshop_enrollment_id"]
            isOneToOne: false
            referencedRelation: "workshop_enrollment"
            referencedColumns: ["id"]
          },
        ]
      }
      export_job: {
        Row: {
          attempt_count: number
          column_order: string[]
          completed_at: string | null
          created_at: string
          error_message: string | null
          expires_at: string | null
          export_type: string
          file_size_bytes: number | null
          filters: Json
          id: string
          query_params: Json
          requested_by: string
          row_count: number | null
          sort: Json
          source_table: string
          started_at: string | null
          status: Database["public"]["Enums"]["export_job_status"]
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          column_order?: string[]
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          export_type: string
          file_size_bytes?: number | null
          filters?: Json
          id?: string
          query_params?: Json
          requested_by: string
          row_count?: number | null
          sort?: Json
          source_table: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_job_status"]
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          column_order?: string[]
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          export_type?: string
          file_size_bytes?: number | null
          filters?: Json
          id?: string
          query_params?: Json
          requested_by?: string
          row_count?: number | null
          sort?: Json
          source_table?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_job_status"]
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      export_job_row: {
        Row: {
          created_at: string
          id: number
          job_id: string
          row_data: Json
          row_index: number
        }
        Insert: {
          created_at?: string
          id?: number
          job_id: string
          row_data: Json
          row_index: number
        }
        Update: {
          created_at?: string
          id?: number
          job_id?: string
          row_data?: Json
          row_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "export_job_row_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "export_job"
            referencedColumns: ["id"]
          },
        ]
      }
      federal_electoral_district: {
        Row: {
          code: number
          created_at: string
          meal_kit: boolean
          name: string
          updated_at: string
          whitelist: boolean
        }
        Insert: {
          code: number
          created_at?: string
          meal_kit?: boolean
          name: string
          updated_at?: string
          whitelist?: boolean
        }
        Update: {
          code?: number
          created_at?: string
          meal_kit?: boolean
          name?: string
          updated_at?: string
          whitelist?: boolean
        }
        Relationships: []
      }
      form: {
        Row: {
          auto_assign: Database["public"]["Enums"]["app_role"][]
          created_at: string
          due_at: string | null
          id: string
          is_required: boolean
          name: string
          updated_at: string
        }
        Insert: {
          auto_assign?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          due_at?: string | null
          id?: string
          is_required?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          auto_assign?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          due_at?: string | null
          id?: string
          is_required?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_answer: {
        Row: {
          id: string
          question_code: string
          submission_id: string
          value: Json
        }
        Insert: {
          id?: string
          question_code: string
          submission_id: string
          value: Json
        }
        Update: {
          id?: string
          question_code?: string
          submission_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_answer_question_code_fkey"
            columns: ["question_code"]
            isOneToOne: false
            referencedRelation: "form_question"
            referencedColumns: ["question_code"]
          },
          {
            foreignKeyName: "form_answer_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submission"
            referencedColumns: ["id"]
          },
        ]
      }
      form_assignment: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          due_at: string | null
          form_id: string
          id: string
          status: Database["public"]["Enums"]["form_assignment_status"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          due_at?: string | null
          form_id: string
          id?: string
          status?: Database["public"]["Enums"]["form_assignment_status"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          due_at?: string | null
          form_id?: string
          id?: string
          status?: Database["public"]["Enums"]["form_assignment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_assignment_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      form_question: {
        Row: {
          options: Json
          prompt: string
          question_code: string
          type: Database["public"]["Enums"]["form_question_type"]
        }
        Insert: {
          options?: Json
          prompt: string
          question_code: string
          type: Database["public"]["Enums"]["form_question_type"]
        }
        Update: {
          options?: Json
          prompt?: string
          question_code?: string
          type?: Database["public"]["Enums"]["form_question_type"]
        }
        Relationships: []
      }
      form_question_map: {
        Row: {
          form_id: string
          metadata: Json
          options_override: Json | null
          position: number
          prompt_override: string | null
          question_code: string
          visibility_condition: Json | null
        }
        Insert: {
          form_id: string
          metadata?: Json
          options_override?: Json | null
          position: number
          prompt_override?: string | null
          question_code: string
          visibility_condition?: Json | null
        }
        Update: {
          form_id?: string
          metadata?: Json
          options_override?: Json | null
          position?: number
          prompt_override?: string | null
          question_code?: string
          visibility_condition?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_question_map_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_question_map_question_code_fkey"
            columns: ["question_code"]
            isOneToOne: false
            referencedRelation: "form_question"
            referencedColumns: ["question_code"]
          },
        ]
      }
      form_submission: {
        Row: {
          accept_language: string | null
          form_id: string
          forwarded_for: string | null
          id: string
          ip_address: unknown
          ip_chain: Json
          ip_classification: string
          ip_classifier_version: number
          ip_confidence_level: string
          ip_parse_confidence: string
          ip_parse_notes: Json
          ip_parse_version: number
          ip_reason_codes: Json
          ip_reason_text: string | null
          ip_selected: unknown
          ip_selected_source: string | null
          metadata: Json
          origin: string | null
          profile_id: string
          proxy_match_cidr: unknown
          proxy_provider_match: string | null
          referer: string | null
          request_headers: Json
          submitted_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accept_language?: string | null
          form_id: string
          forwarded_for?: string | null
          id?: string
          ip_address?: unknown
          ip_chain?: Json
          ip_classification?: string
          ip_classifier_version?: number
          ip_confidence_level?: string
          ip_parse_confidence?: string
          ip_parse_notes?: Json
          ip_parse_version?: number
          ip_reason_codes?: Json
          ip_reason_text?: string | null
          ip_selected?: unknown
          ip_selected_source?: string | null
          metadata?: Json
          origin?: string | null
          profile_id: string
          proxy_match_cidr?: unknown
          proxy_provider_match?: string | null
          referer?: string | null
          request_headers?: Json
          submitted_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accept_language?: string | null
          form_id?: string
          forwarded_for?: string | null
          id?: string
          ip_address?: unknown
          ip_chain?: Json
          ip_classification?: string
          ip_classifier_version?: number
          ip_confidence_level?: string
          ip_parse_confidence?: string
          ip_parse_notes?: Json
          ip_parse_version?: number
          ip_reason_codes?: Json
          ip_reason_text?: string | null
          ip_selected?: unknown
          ip_selected_source?: string | null
          metadata?: Json
          origin?: string | null
          profile_id?: string
          proxy_match_cidr?: unknown
          proxy_provider_match?: string | null
          referer?: string | null
          request_headers?: Json
          submitted_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submission_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submission_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_asset: {
        Row: {
          account_number: string
          allocated_at: string | null
          asset_url: string
          assigned_profile_id: string | null
          created_at: string
          id: string
          metadata: Json
          opened_at: string | null
          opened_count: number
          last_opened_at: string | null
          page_count: number | null
          pin: string
          provider: Database["public"]["Enums"]["gift_card_provider"]
          reminder_sent_at: string | null
          sent_at: string | null
          source_index: number | null
          status: Database["public"]["Enums"]["gift_card_asset_status"]
          updated_at: string
          upload_id: string
          used_at: string | null
          value: number
        }
        Insert: {
          account_number: string
          allocated_at?: string | null
          asset_url: string
          assigned_profile_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          opened_at?: string | null
          opened_count?: number
          last_opened_at?: string | null
          page_count?: number | null
          pin: string
          provider?: Database["public"]["Enums"]["gift_card_provider"]
          reminder_sent_at?: string | null
          sent_at?: string | null
          source_index?: number | null
          status?: Database["public"]["Enums"]["gift_card_asset_status"]
          updated_at?: string
          upload_id: string
          used_at?: string | null
          value: number
        }
        Update: {
          account_number?: string
          allocated_at?: string | null
          asset_url?: string
          assigned_profile_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          opened_at?: string | null
          opened_count?: number
          last_opened_at?: string | null
          page_count?: number | null
          pin?: string
          provider?: Database["public"]["Enums"]["gift_card_provider"]
          reminder_sent_at?: string | null
          sent_at?: string | null
          source_index?: number | null
          status?: Database["public"]["Enums"]["gift_card_asset_status"]
          updated_at?: string
          upload_id?: string
          used_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_asset_assigned_profile_id_fkey"
            columns: ["assigned_profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_asset_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "gift_card_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_allocation: {
        Row: {
          blocked: boolean
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          class_attendance_id: string | null
          class_id: string
          created_at: string
          first_opened_at: string | null
          gift_card_asset_id: string
          glr_token_hash: string | null
          id: string
          last_opened_at: string | null
          metadata: Json
          open_count: number
          profile_id: string
          reminder_email_message_id: string | null
          reminder_event_key: string | null
          reminder_sent_at: string | null
          status: Database["public"]["Enums"]["gift_card_allocation_status"]
          updated_at: string
        }
        Insert: {
          blocked?: boolean
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          class_attendance_id?: string | null
          class_id: string
          created_at?: string
          first_opened_at?: string | null
          gift_card_asset_id: string
          glr_token_hash?: string | null
          id?: string
          last_opened_at?: string | null
          metadata?: Json
          open_count?: number
          profile_id: string
          reminder_email_message_id?: string | null
          reminder_event_key?: string | null
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["gift_card_allocation_status"]
          updated_at?: string
        }
        Update: {
          blocked?: boolean
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          class_attendance_id?: string | null
          class_id?: string
          created_at?: string
          first_opened_at?: string | null
          gift_card_asset_id?: string
          glr_token_hash?: string | null
          id?: string
          last_opened_at?: string | null
          metadata?: Json
          open_count?: number
          profile_id?: string
          reminder_email_message_id?: string | null
          reminder_event_key?: string | null
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["gift_card_allocation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_allocation_class_attendance_id_fkey"
            columns: ["class_attendance_id"]
            isOneToOne: false
            referencedRelation: "class_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_allocation_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_allocation_gift_card_asset_id_fkey"
            columns: ["gift_card_asset_id"]
            isOneToOne: false
            referencedRelation: "gift_card_asset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_allocation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_click_event: {
        Row: {
          created_at: string
          gift_card_allocation_id: string
          id: string
          ip_address: unknown
          metadata: Json
          profile_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          gift_card_allocation_id: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          profile_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          gift_card_allocation_id?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          profile_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_click_event_gift_card_allocation_id_fkey"
            columns: ["gift_card_allocation_id"]
            isOneToOne: false
            referencedRelation: "gift_card_allocation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_click_event_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_upload: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string | null
          file_size: number | null
          id: string
          metadata: Json
          processed_cards: number
          provider: string | null
          status: Database["public"]["Enums"]["gift_card_upload_status"]
          total_cards: number
          updated_at: string
          upload_type: Database["public"]["Enums"]["gift_card_upload_type"]
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json
          processed_cards?: number
          provider?: string | null
          status?: Database["public"]["Enums"]["gift_card_upload_status"]
          total_cards?: number
          updated_at?: string
          upload_type: Database["public"]["Enums"]["gift_card_upload_type"]
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json
          processed_cards?: number
          provider?: string | null
          status?: Database["public"]["Enums"]["gift_card_upload_status"]
          total_cards?: number
          updated_at?: string
          upload_type?: Database["public"]["Enums"]["gift_card_upload_type"]
          uploaded_by?: string | null
        }
        Relationships: []
      }
      invites: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          invitee_email: string
          invitee_user_id: string | null
          inviter_user_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invite_status"]
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          invitee_email: string
          invitee_user_id?: string | null
          inviter_user_id: string
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          invitee_email?: string
          invitee_user_id?: string | null
          inviter_user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          updated_at?: string
        }
        Relationships: []
      }
      ip_geolocation_cache: {
        Row: {
          city: string | null
          confidence: string | null
          country_code: string | null
          created_at: string
          expires_at: string
          ip: unknown
          latitude: number | null
          longitude: number | null
          looked_up_at: string
          org: string | null
          raw: Json
          region: string | null
          source: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          confidence?: string | null
          country_code?: string | null
          created_at?: string
          expires_at: string
          ip: unknown
          latitude?: number | null
          longitude?: number | null
          looked_up_at?: string
          org?: string | null
          raw?: Json
          region?: string | null
          source: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          confidence?: string | null
          country_code?: string | null
          created_at?: string
          expires_at?: string
          ip?: unknown
          latitude?: number | null
          longitude?: number | null
          looked_up_at?: string
          org?: string | null
          raw?: Json
          region?: string | null
          source?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ip_org_policy: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          match_mode: string
          note: string | null
          org_pattern: string
          policy_class: string
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          match_mode?: string
          note?: string | null
          org_pattern: string
          policy_class?: string
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          match_mode?: string
          note?: string | null
          org_pattern?: string
          policy_class?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      login_event: {
        Row: {
          accept_language: string | null
          email: string | null
          event_at: string
          forwarded_for: string | null
          id: string
          ip_address: unknown
          ip_chain: Json
          ip_classification: string
          ip_classifier_version: number
          ip_confidence_level: string
          ip_parse_confidence: string
          ip_parse_notes: Json
          ip_parse_version: number
          ip_reason_codes: Json
          ip_reason_text: string | null
          ip_selected: unknown
          ip_selected_source: string | null
          login_method: string
          metadata: Json
          origin: string | null
          proxy_match_cidr: unknown
          proxy_provider_match: string | null
          referer: string | null
          request_headers: Json
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accept_language?: string | null
          email?: string | null
          event_at?: string
          forwarded_for?: string | null
          id?: string
          ip_address?: unknown
          ip_chain?: Json
          ip_classification?: string
          ip_classifier_version?: number
          ip_confidence_level?: string
          ip_parse_confidence?: string
          ip_parse_notes?: Json
          ip_parse_version?: number
          ip_reason_codes?: Json
          ip_reason_text?: string | null
          ip_selected?: unknown
          ip_selected_source?: string | null
          login_method: string
          metadata?: Json
          origin?: string | null
          proxy_match_cidr?: unknown
          proxy_provider_match?: string | null
          referer?: string | null
          request_headers?: Json
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accept_language?: string | null
          email?: string | null
          event_at?: string
          forwarded_for?: string | null
          id?: string
          ip_address?: unknown
          ip_chain?: Json
          ip_classification?: string
          ip_classifier_version?: number
          ip_confidence_level?: string
          ip_parse_confidence?: string
          ip_parse_notes?: Json
          ip_parse_version?: number
          ip_reason_codes?: Json
          ip_reason_text?: string | null
          ip_selected?: unknown
          ip_selected_source?: string | null
          login_method?: string
          metadata?: Json
          origin?: string | null
          proxy_match_cidr?: unknown
          proxy_provider_match?: string | null
          referer?: string | null
          request_headers?: Json
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      network_proxy_range: {
        Row: {
          cidr: unknown
          created_at: string
          id: string
          ip_family: number
          provider: string
          updated_at: string
          version_tag: string | null
        }
        Insert: {
          cidr: unknown
          created_at?: string
          id?: string
          ip_family: number
          provider: string
          updated_at?: string
          version_tag?: string | null
        }
        Update: {
          cidr?: unknown
          created_at?: string
          id?: string
          ip_family?: number
          provider?: string
          updated_at?: string
          version_tag?: string | null
        }
        Relationships: []
      }
      person_guardian_child: {
        Row: {
          child_profile_id: string
          guardian_profile_id: string
          id: string
          primary_child: boolean
        }
        Insert: {
          child_profile_id: string
          guardian_profile_id: string
          id?: string
          primary_child?: boolean
        }
        Update: {
          child_profile_id?: string
          guardian_profile_id?: string
          id?: string
          primary_child?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "person_guardian_child_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_guardian_child_guardian_profile_id_fkey"
            columns: ["guardian_profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          address_fingerprint: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          federal_electoral_district_name: string | null
          firstname: string | null
          household_children_count: number | null
          household_size: number | null
          id: string
          partner_program: string | null
          password_set: boolean
          phone: string | null
          postcode: string | null
          province: string | null
          riding_lookup_error: string | null
          riding_lookup_last_attempt_at: string | null
          riding_lookup_status: string | null
          role: Database["public"]["Enums"]["app_role"]
          street_address: string | null
          surname: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_fingerprint?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          federal_electoral_district_name?: string | null
          firstname?: string | null
          household_children_count?: number | null
          household_size?: number | null
          id?: string
          partner_program?: string | null
          password_set?: boolean
          phone?: string | null
          postcode?: string | null
          province?: string | null
          riding_lookup_error?: string | null
          riding_lookup_last_attempt_at?: string | null
          riding_lookup_status?: string | null
          role: Database["public"]["Enums"]["app_role"]
          street_address?: string | null
          surname?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_fingerprint?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          federal_electoral_district_name?: string | null
          firstname?: string | null
          household_children_count?: number | null
          household_size?: number | null
          id?: string
          partner_program?: string | null
          password_set?: boolean
          phone?: string | null
          postcode?: string | null
          province?: string | null
          riding_lookup_error?: string | null
          riding_lookup_last_attempt_at?: string | null
          riding_lookup_status?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          street_address?: string | null
          surname?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_federal_electoral_district_name_fkey"
            columns: ["federal_electoral_district_name"]
            isOneToOne: false
            referencedRelation: "federal_electoral_district"
            referencedColumns: ["name"]
          },
        ]
      }
      role_permission: {
        Row: {
          permission: Database["public"]["Enums"]["app_permissions"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          permission: Database["public"]["Enums"]["app_permissions"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          permission?: Database["public"]["Enums"]["app_permissions"]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      semester: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string
          enrollment_close_at: string | null
          enrollment_open_at: string | null
          id: string
          name: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at: string
          enrollment_close_at?: string | null
          enrollment_open_at?: string | null
          id?: string
          name?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string
          enrollment_close_at?: string | null
          enrollment_open_at?: string | null
          id?: string
          name?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      semester_form_requirement: {
        Row: {
          created_at: string
          form_id: string
          id: string
          is_active: boolean
          is_required: boolean
          kind: Database["public"]["Enums"]["semester_survey_kind"]
          semester_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          kind: Database["public"]["Enums"]["semester_survey_kind"]
          semester_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          kind?: Database["public"]["Enums"]["semester_survey_kind"]
          semester_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "semester_form_requirement_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semester_form_requirement_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semester"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_up_flow: {
        Row: {
          condition: Json | null
          created_at: string
          form_id: string
          id: string
          roles: Database["public"]["Enums"]["app_role"][]
          slug: string
          step_order: number
          updated_at: string
        }
        Insert: {
          condition?: Json | null
          created_at?: string
          form_id: string
          id?: string
          roles: Database["public"]["Enums"]["app_role"][]
          slug: string
          step_order: number
          updated_at?: string
        }
        Update: {
          condition?: Json | null
          created_at?: string
          form_id?: string
          id?: string
          roles?: Database["public"]["Enums"]["app_role"][]
          slug?: string
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sign_up_flow_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_up_terms: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          slug: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      sign_up_terms_consent: {
        Row: {
          accepted_at: string
          email: string
          id: string
          metadata: Json
          profile_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          sign_up_terms_id: string
          terms_content: string
          terms_version: number
          user_id: string | null
        }
        Insert: {
          accepted_at?: string
          email: string
          id?: string
          metadata?: Json
          profile_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          sign_up_terms_id: string
          terms_content: string
          terms_version: number
          user_id?: string | null
        }
        Update: {
          accepted_at?: string
          email?: string
          id?: string
          metadata?: Json
          profile_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          sign_up_terms_id?: string
          terms_content?: string
          terms_version?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sign_up_terms_consent_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sign_up_terms_consent_sign_up_terms_id_fkey"
            columns: ["sign_up_terms_id"]
            isOneToOne: false
            referencedRelation: "sign_up_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      suspicious_signal: {
        Row: {
          created_at: string
          details: Json
          family_profile_ids: string[]
          id: string
          priority_reason: string | null
          priority_score: number
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          signal_type: string
          status: string
          subject_profile_id: string
          summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          family_profile_ids?: string[]
          id?: string
          priority_reason?: string | null
          priority_score?: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          signal_type: string
          status?: string
          subject_profile_id: string
          summary: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          family_profile_ids?: string[]
          id?: string
          priority_reason?: string | null
          priority_score?: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          signal_type?: string
          status?: string
          subject_profile_id?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suspicious_signal_subject_profile_id_fkey"
            columns: ["subject_profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workshop: {
        Row: {
          capacity: number
          created_at: string
          description: string | null
          enrollment_close_at: string | null
          enrollment_open_at: string | null
          id: string
          semester_id: string
          timezone: string
          updated_at: string
          wait_list_capacity: number
        }
        Insert: {
          capacity?: number
          created_at?: string
          description?: string | null
          enrollment_close_at?: string | null
          enrollment_open_at?: string | null
          id?: string
          semester_id: string
          timezone?: string
          updated_at?: string
          wait_list_capacity?: number
        }
        Update: {
          capacity?: number
          created_at?: string
          description?: string | null
          enrollment_close_at?: string | null
          enrollment_open_at?: string | null
          id?: string
          semester_id?: string
          timezone?: string
          updated_at?: string
          wait_list_capacity?: number
        }
        Relationships: [
          {
            foreignKeyName: "workshop_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semester"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_enrollment: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          profile_id: string | null
          requested_at: string
          semester_id: string
          status: Database["public"]["Enums"]["workshop_enrollment_status"]
          updated_at: string
          workshop_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          profile_id?: string | null
          requested_at?: string
          semester_id: string
          status?: Database["public"]["Enums"]["workshop_enrollment_status"]
          updated_at?: string
          workshop_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          profile_id?: string | null
          requested_at?: string
          semester_id?: string
          status?: Database["public"]["Enums"]["workshop_enrollment_status"]
          updated_at?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_enrollment_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_enrollment_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semester"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_enrollment_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshop"
            referencedColumns: ["id"]
          },
        ]
      }
      zlr_click_event: {
        Row: {
          class_zoom_registrant_id: string
          clicked_at: string
          id: string
          ip_address: unknown
          metadata: Json
          profile_id: string | null
          user_agent: string | null
        }
        Insert: {
          class_zoom_registrant_id: string
          clicked_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          profile_id?: string | null
          user_agent?: string | null
        }
        Update: {
          class_zoom_registrant_id?: string
          clicked_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          profile_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zlr_click_event_class_zoom_registrant_id_fkey"
            columns: ["class_zoom_registrant_id"]
            isOneToOne: false
            referencedRelation: "class_zoom_registrant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zlr_click_event_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_host: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          notes: string | null
          priority: number
          updated_at: string
          zoom_user_email: string | null
          zoom_user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          priority?: number
          updated_at?: string
          zoom_user_email?: string | null
          zoom_user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          priority?: number
          updated_at?: string
          zoom_user_email?: string | null
          zoom_user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assignee_can_read_form: { Args: { p_form_id: string }; Returns: boolean }
      authorize: {
        Args: {
          requested_permission: Database["public"]["Enums"]["app_permissions"]
        }
        Returns: boolean
      }
      claim_next_export_job: {
        Args: never
        Returns: {
          attempt_count: number
          column_order: string[]
          completed_at: string | null
          created_at: string
          error_message: string | null
          expires_at: string | null
          export_type: string
          file_size_bytes: number | null
          filters: Json
          id: string
          query_params: Json
          requested_by: string
          row_count: number | null
          sort: Json
          source_table: string
          started_at: string | null
          status: Database["public"]["Enums"]["export_job_status"]
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "export_job"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_profile_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      ensure_class_attendance_rows: { Args: never; Returns: undefined }
      has_completed_required_forms: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      normalize_address_fingerprint: {
        Args: {
          city: string
          postcode: string
          province: string
          street_address: string
        }
        Returns: string
      }
      profile_in_same_family: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      request_family_workshop_enrollment: {
        Args: {
          p_family_profile_ids: string[]
          p_profile_id: string
          p_workshop_id: string
        }
        Returns: {
          enrollment_id: string
          enrollment_status: Database["public"]["Enums"]["workshop_enrollment_status"]
          error_code: string
          error_message: string
          ok: boolean
        }[]
      }
      should_auto_promote_onboarding: { Args: never; Returns: boolean }
      sync_auto_assigned_forms_for_form: {
        Args: { p_form_id: string }
        Returns: undefined
      }
      sync_auto_assigned_forms_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_permissions:
        | "site.read"
        | "form.create"
        | "form.read"
        | "form.update"
        | "form.delete"
        | "form_question.create"
        | "form_question.read"
        | "form_question.update"
        | "form_question.delete"
        | "form_question_map.create"
        | "form_question_map.read"
        | "form_question_map.update"
        | "form_question_map.delete"
        | "form_assignment.create"
        | "form_assignment.read"
        | "form_assignment.update"
        | "form_assignment.delete"
        | "form_submission.create"
        | "form_submission.read"
        | "form_submission.update"
        | "form_submission.delete"
        | "form_answer.create"
        | "form_answer.read"
        | "form_answer.update"
        | "form_answer.delete"
        | "semester.create"
        | "semester.read"
        | "semester.update"
        | "semester.delete"
        | "workshop.create"
        | "workshop.read"
        | "workshop.update"
        | "workshop.delete"
        | "workshop_enrollment.create"
        | "workshop_enrollment.read"
        | "workshop_enrollment.update"
        | "workshop_enrollment.update_status"
        | "class_attendance.create"
        | "class_attendance.read"
        | "class_attendance.update"
        | "class_attendance.delete"
        | "user_roles.manage"
        | "role_permission.manage"
        | "profiles.read"
        | "profiles.update"
        | "zoom_host.create"
        | "zoom_host.read"
        | "zoom_host.update"
        | "zoom_host.delete"
        | "class_zoom_meeting.create"
        | "class_zoom_meeting.read"
        | "class_zoom_meeting.update"
        | "class_zoom_meeting.delete"
        | "class_zoom_registrant.create"
        | "class_zoom_registrant.read"
        | "class_zoom_registrant.update"
        | "class_zoom_registrant.delete"
        | "class_zoom_participant_sync.create"
        | "class_zoom_participant_sync.read"
        | "class_zoom_participant_sync.update"
        | "class_zoom_participant_sync.delete"
        | "class_zoom_participant.create"
        | "class_zoom_participant.read"
        | "class_zoom_participant.update"
        | "class_zoom_participant.delete"
        | "zlr_click_event.create"
        | "zlr_click_event.read"
        | "zlr_click_event.update"
        | "zlr_click_event.delete"
      app_role:
        | "unassigned"
        | "admin"
        | "manager"
        | "staff"
        | "instructor"
        | "student"
        | "guardian"
      class_attendance_photo_status: "uploaded" | "accepted" | "rejected"
      class_attendance_status: "unknown" | "present" | "absent"
      email_draft_channel: "transactional" | "auth"
      email_draft_status: "draft" | "published" | "archived"
      email_message_status: "queued" | "sent" | "failed" | "skipped"
      export_job_status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
        | "expired"
        | "cancelled"
      form_assignment_status: "pending" | "submitted"
      form_question_type:
        | "text"
        | "number"
        | "single_choice"
        | "multi_choice"
        | "date"
        | "address"
        | "agreement"
        | "checkbox"
        | "no-input-text"
      gift_card_allocation_status: "allocated" | "sent" | "opened"
      gift_card_asset_status:
        | "available"
        | "allocated"
        | "sent"
        | "opened"
        | "used"
        | "invalid"
      gift_card_provider: "PC" | "Sobeys"
      gift_card_upload_status:
        | "uploaded"
        | "processing"
        | "processed"
        | "failed"
      gift_card_upload_type: "pdf_per_page" | "pdf_per_4_pages" | "csv_link"
      invite_status: "pending" | "confirmed" | "revoked"
      semester_survey_kind: "pre_survey" | "post_survey"
      workshop_enrollment_status:
        | "pending"
        | "waitlisted"
        | "approved"
        | "rejected"
        | "revoked"
      zoom_meeting_status: "pending" | "created" | "failed" | "cancelled"
      zoom_sync_status: "pending" | "running" | "completed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_permissions: [
        "site.read",
        "form.create",
        "form.read",
        "form.update",
        "form.delete",
        "form_question.create",
        "form_question.read",
        "form_question.update",
        "form_question.delete",
        "form_question_map.create",
        "form_question_map.read",
        "form_question_map.update",
        "form_question_map.delete",
        "form_assignment.create",
        "form_assignment.read",
        "form_assignment.update",
        "form_assignment.delete",
        "form_submission.create",
        "form_submission.read",
        "form_submission.update",
        "form_submission.delete",
        "form_answer.create",
        "form_answer.read",
        "form_answer.update",
        "form_answer.delete",
        "semester.create",
        "semester.read",
        "semester.update",
        "semester.delete",
        "workshop.create",
        "workshop.read",
        "workshop.update",
        "workshop.delete",
        "workshop_enrollment.create",
        "workshop_enrollment.read",
        "workshop_enrollment.update",
        "workshop_enrollment.update_status",
        "class_attendance.create",
        "class_attendance.read",
        "class_attendance.update",
        "class_attendance.delete",
        "user_roles.manage",
        "role_permission.manage",
        "profiles.read",
        "profiles.update",
        "zoom_host.create",
        "zoom_host.read",
        "zoom_host.update",
        "zoom_host.delete",
        "class_zoom_meeting.create",
        "class_zoom_meeting.read",
        "class_zoom_meeting.update",
        "class_zoom_meeting.delete",
        "class_zoom_registrant.create",
        "class_zoom_registrant.read",
        "class_zoom_registrant.update",
        "class_zoom_registrant.delete",
        "class_zoom_participant_sync.create",
        "class_zoom_participant_sync.read",
        "class_zoom_participant_sync.update",
        "class_zoom_participant_sync.delete",
        "class_zoom_participant.create",
        "class_zoom_participant.read",
        "class_zoom_participant.update",
        "class_zoom_participant.delete",
        "zlr_click_event.create",
        "zlr_click_event.read",
        "zlr_click_event.update",
        "zlr_click_event.delete",
      ],
      app_role: [
        "unassigned",
        "admin",
        "manager",
        "staff",
        "instructor",
        "student",
        "guardian",
      ],
      class_attendance_photo_status: ["uploaded", "accepted", "rejected"],
      class_attendance_status: ["unknown", "present", "absent"],
      email_draft_channel: ["transactional", "auth"],
      email_draft_status: ["draft", "published", "archived"],
      email_message_status: ["queued", "sent", "failed", "skipped"],
      export_job_status: [
        "queued",
        "running",
        "completed",
        "failed",
        "expired",
        "cancelled",
      ],
      form_assignment_status: ["pending", "submitted"],
      form_question_type: [
        "text",
        "number",
        "single_choice",
        "multi_choice",
        "date",
        "address",
        "agreement",
        "checkbox",
        "no-input-text",
      ],
      gift_card_allocation_status: ["allocated", "sent", "opened"],
      gift_card_asset_status: [
        "available",
        "allocated",
        "sent",
        "opened",
        "used",
        "invalid",
      ],
      gift_card_provider: ["PC", "Sobeys"],
      gift_card_upload_status: [
        "uploaded",
        "processing",
        "processed",
        "failed",
      ],
      gift_card_upload_type: ["pdf_per_page", "pdf_per_4_pages", "csv_link"],
      invite_status: ["pending", "confirmed", "revoked"],
      semester_survey_kind: ["pre_survey", "post_survey"],
      workshop_enrollment_status: [
        "pending",
        "waitlisted",
        "approved",
        "rejected",
        "revoked",
      ],
      zoom_meeting_status: ["pending", "created", "failed", "cancelled"],
      zoom_sync_status: ["pending", "running", "completed", "failed"],
    },
  },
} as const
