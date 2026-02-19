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
          cohort_id: string | null
          created_at: string
          ends_at: string
          id: string
          location: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          location?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          location?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort: {
        Row: {
          created_at: string
          id: string
          name: string
          semester_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          semester_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          semester_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semester"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_enrollment: {
        Row: {
          cohort_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["cohort_enrollment_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["cohort_enrollment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["cohort_enrollment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_enrollment_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort"
            referencedColumns: ["id"]
          },
        ]
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
          question_id: string
          submission_id: string
          value: Json
        }
        Insert: {
          id?: string
          question_id: string
          submission_id: string
          value: Json
        }
        Update: {
          id?: string
          question_id?: string
          submission_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_answer_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_question"
            referencedColumns: ["id"]
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
          form_id: string
          id: string
          kind: Database["public"]["Enums"]["form_question_type"]
          options: Json
          position: number
          prompt: string
        }
        Insert: {
          form_id: string
          id?: string
          kind: Database["public"]["Enums"]["form_question_type"]
          options?: Json
          position: number
          prompt: string
        }
        Update: {
          form_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["form_question_type"]
          options?: Json
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_question_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submission: {
        Row: {
          form_id: string
          id: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          form_id: string
          id?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          form_id?: string
          id?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submission_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          metadata: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          metadata?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
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
          ends_at: string
          ends_month: string
          id: string
          name: string
          starts_at: string
          starts_month: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          ends_month: string
          id?: string
          name: string
          starts_at: string
          starts_month: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          ends_month?: string
          id?: string
          name?: string
          starts_at?: string
          starts_month?: string
          updated_at?: string
        }
        Relationships: []
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
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      has_completed_required_forms: {
        Args: { p_user_id: string }
        Returns: boolean
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
        | "user_roles.manage"
        | "role_permission.manage"
        | "profiles.read"
        | "profiles.update"
        | "semester.create"
        | "semester.read"
        | "semester.update"
        | "semester.delete"
        | "cohort.create"
        | "cohort.read"
        | "cohort.update"
        | "cohort.delete"
        | "class.create"
        | "class.read"
        | "class.update"
        | "class.delete"
        | "cohort_enrollment.create"
        | "cohort_enrollment.read"
        | "cohort_enrollment.update"
        | "cohort_enrollment.update_status"
      app_role:
        | "unassigned"
        | "admin"
        | "manager"
        | "staff"
        | "instructor"
        | "student"
        | "parent"
      cohort_enrollment_status: "pending" | "approved" | "rejected"
      form_assignment_status: "pending" | "submitted"
      form_question_type:
        | "text"
        | "single_choice"
        | "multi_choice"
        | "date"
        | "address"
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
        "user_roles.manage",
        "role_permission.manage",
        "profiles.read",
        "profiles.update",
        "semester.create",
        "semester.read",
        "semester.update",
        "semester.delete",
        "cohort.create",
        "cohort.read",
        "cohort.update",
        "cohort.delete",
        "class.create",
        "class.read",
        "class.update",
        "class.delete",
        "cohort_enrollment.create",
        "cohort_enrollment.read",
        "cohort_enrollment.update",
        "cohort_enrollment.update_status",
      ],
      app_role: [
        "unassigned",
        "admin",
        "manager",
        "staff",
        "instructor",
        "student",
        "parent",
      ],
      cohort_enrollment_status: ["pending", "approved", "rejected"],
      form_assignment_status: ["pending", "submitted"],
      form_question_type: [
        "text",
        "single_choice",
        "multi_choice",
        "date",
        "address",
      ],
    },
  },
} as const

