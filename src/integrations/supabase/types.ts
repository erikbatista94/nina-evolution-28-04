export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          attendees: string[] | null
          contact_id: string | null
          created_at: string
          date: string
          description: string | null
          duration: number
          google_event_id: string | null
          google_sync_status: string | null
          id: string
          location: string | null
          meeting_url: string | null
          metadata: Json | null
          status: string | null
          time: string
          title: string
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attendees?: string[] | null
          contact_id?: string | null
          created_at?: string
          date: string
          description?: string | null
          duration?: number
          google_event_id?: string | null
          google_sync_status?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          status?: string | null
          time: string
          title: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attendees?: string[] | null
          contact_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          duration?: number
          google_event_id?: string | null
          google_sync_status?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          status?: string | null
          time?: string
          title?: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address_full: string | null
          assigned_user_id: string | null
          blocked_at: string | null
          blocked_reason: string | null
          call_name: string | null
          city: string | null
          client_memory: Json | null
          created_at: string
          customer_type: string | null
          email: string | null
          first_contact_date: string
          has_project: boolean | null
          id: string
          interest_services: string[] | null
          is_blocked: boolean | null
          is_business: boolean | null
          is_urgent: boolean | null
          job_size: string | null
          last_activity: string
          last_interaction_at: string | null
          lead_score: number | null
          lead_status: string | null
          lead_temperature: string | null
          name: string | null
          neighborhood: string | null
          next_best_action: string | null
          notes: string | null
          phone_number: string
          profile_picture_url: string | null
          qualification_gaps: Json | null
          source: string | null
          start_timeframe: string | null
          tags: string[] | null
          updated_at: string
          user_id: string | null
          whatsapp_id: string | null
        }
        Insert: {
          address_full?: string | null
          assigned_user_id?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_name?: string | null
          city?: string | null
          client_memory?: Json | null
          created_at?: string
          customer_type?: string | null
          email?: string | null
          first_contact_date?: string
          has_project?: boolean | null
          id?: string
          interest_services?: string[] | null
          is_blocked?: boolean | null
          is_business?: boolean | null
          is_urgent?: boolean | null
          job_size?: string | null
          last_activity?: string
          last_interaction_at?: string | null
          lead_score?: number | null
          lead_status?: string | null
          lead_temperature?: string | null
          name?: string | null
          neighborhood?: string | null
          next_best_action?: string | null
          notes?: string | null
          phone_number: string
          profile_picture_url?: string | null
          qualification_gaps?: Json | null
          source?: string | null
          start_timeframe?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
          whatsapp_id?: string | null
        }
        Update: {
          address_full?: string | null
          assigned_user_id?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_name?: string | null
          city?: string | null
          client_memory?: Json | null
          created_at?: string
          customer_type?: string | null
          email?: string | null
          first_contact_date?: string
          has_project?: boolean | null
          id?: string
          interest_services?: string[] | null
          is_blocked?: boolean | null
          is_business?: boolean | null
          is_urgent?: boolean | null
          job_size?: string | null
          last_activity?: string
          last_interaction_at?: string | null
          lead_score?: number | null
          lead_status?: string | null
          lead_temperature?: string | null
          name?: string | null
          neighborhood?: string | null
          next_best_action?: string | null
          notes?: string | null
          phone_number?: string
          profile_picture_url?: string | null
          qualification_gaps?: Json | null
          source?: string | null
          start_timeframe?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
          whatsapp_id?: string | null
        }
        Relationships: []
      }
      conversation_events: {
        Row: {
          contact_id: string | null
          conversation_id: string
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id: string
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: []
      }
      conversation_ownership_log: {
        Row: {
          action: string
          conversation_id: string
          created_at: string | null
          id: string
          notes: string | null
          previous_user_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          conversation_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          previous_user_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          previous_user_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_ownership_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_states: {
        Row: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          current_state?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          scheduling_context?: Json | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          current_state?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          scheduling_context?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_team: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id: string | null
          contact_id: string
          created_at: string
          human_status: string | null
          id: string
          is_active: boolean
          last_human_interaction_at: string | null
          last_message_at: string
          metadata: Json | null
          nina_context: Json | null
          started_at: string
          status: Database["public"]["Enums"]["conversation_status"]
          tags: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_team?: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id?: string | null
          contact_id: string
          created_at?: string
          human_status?: string | null
          id?: string
          is_active?: boolean
          last_human_interaction_at?: string | null
          last_message_at?: string
          metadata?: Json | null
          nina_context?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_team?: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id?: string | null
          contact_id?: string
          created_at?: string
          human_status?: string | null
          id?: string
          is_active?: boolean
          last_human_interaction_at?: string | null
          last_message_at?: string
          metadata?: Json | null
          nina_context?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activities: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          description: string | null
          id: string
          is_completed: boolean | null
          scheduled_at: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          scheduled_at?: string | null
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          scheduled_at?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          company: string | null
          conditions: string | null
          contact_id: string | null
          created_at: string | null
          due_date: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          owner_id: string | null
          priority: string | null
          proposal_file_path: string | null
          proposal_sent_at: string | null
          proposal_status: string | null
          scope: string | null
          stage: string | null
          stage_id: string
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string | null
          value: number | null
          won_at: string | null
        }
        Insert: {
          company?: string | null
          conditions?: string | null
          contact_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          priority?: string | null
          proposal_file_path?: string | null
          proposal_sent_at?: string | null
          proposal_status?: string | null
          scope?: string | null
          stage?: string | null
          stage_id: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
          won_at?: string | null
        }
        Update: {
          company?: string | null
          conditions?: string | null
          contact_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          priority?: string | null
          proposal_file_path?: string | null
          proposal_sent_at?: string | null
          proposal_status?: string | null
          scope?: string | null
          stage?: string | null
          stage_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_tasks: {
        Row: {
          assigned_user_id: string | null
          attempt_count: number | null
          contact_id: string
          conversation_id: string
          created_at: string | null
          due_at: string
          history: Json | null
          id: string
          result: string | null
          stall_reason: string | null
          status: string
          suggested_message: string | null
          temperature: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          attempt_count?: number | null
          contact_id: string
          conversation_id: string
          created_at?: string | null
          due_at: string
          history?: Json | null
          id?: string
          result?: string | null
          stall_reason?: string | null
          status?: string
          suggested_message?: string | null
          temperature?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          attempt_count?: number | null
          contact_id?: string
          conversation_id?: string
          created_at?: string | null
          due_at?: string
          history?: Json | null
          id?: string
          result?: string | null
          stall_reason?: string | null
          status?: string
          suggested_message?: string | null
          temperature?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_tasks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          id: string
          search_vector: unknown
          source_id: string
          tenant_id: string | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          id?: string
          search_vector?: unknown
          source_id: string
          tenant_id?: string | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          id?: string
          search_vector?: unknown
          source_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          file_path: string | null
          id: string
          indexed_at: string | null
          last_index_error: string | null
          raw_text: string | null
          status: string
          tenant_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          indexed_at?: string | null
          last_index_error?: string | null
          raw_text?: string | null
          status?: string
          tenant_id?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          indexed_at?: string | null
          last_index_error?: string | null
          raw_text?: string | null
          status?: string
          tenant_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_grouping_queue: {
        Row: {
          contacts_data: Json | null
          created_at: string
          id: string
          message_data: Json
          message_id: string | null
          phone_number_id: string
          process_after: string | null
          processed: boolean
          whatsapp_message_id: string
        }
        Insert: {
          contacts_data?: Json | null
          created_at?: string
          id?: string
          message_data: Json
          message_id?: string | null
          phone_number_id: string
          process_after?: string | null
          processed?: boolean
          whatsapp_message_id: string
        }
        Update: {
          contacts_data?: Json | null
          created_at?: string
          id?: string
          message_data?: Json
          message_id?: string | null
          phone_number_id?: string
          process_after?: string | null
          processed?: boolean
          whatsapp_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_grouping_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_processing_queue: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          phone_number_id: string
          priority: number
          processed_at: string | null
          raw_data: Json
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          whatsapp_message_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number_id: string
          priority?: number
          processed_at?: string | null
          raw_data: Json
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          whatsapp_message_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number_id?: string
          priority?: number
          processed_at?: string | null
          raw_data?: Json
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          whatsapp_message_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          from_type: Database["public"]["Enums"]["message_from"]
          id: string
          media_type: string | null
          media_url: string | null
          metadata: Json | null
          nina_response_time: number | null
          processed_by_nina: boolean | null
          read_at: string | null
          reply_to_id: string | null
          sender_user_id: string | null
          sent_at: string
          status: Database["public"]["Enums"]["message_status"]
          type: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          from_type: Database["public"]["Enums"]["message_from"]
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          nina_response_time?: number | null
          processed_by_nina?: boolean | null
          read_at?: string | null
          reply_to_id?: string | null
          sender_user_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          from_type?: Database["public"]["Enums"]["message_from"]
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          nina_response_time?: number | null
          processed_by_nina?: boolean | null
          read_at?: string | null
          reply_to_id?: string | null
          sender_user_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_processing_queue: {
        Row: {
          contact_id: string
          context_data: Json | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          priority: number
          processed_at: string | null
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          context_data?: Json | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          priority?: number
          processed_at?: string | null
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          context_data?: Json | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          priority?: number
          processed_at?: string | null
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: []
      }
      nina_settings: {
        Row: {
          adaptive_response_enabled: boolean
          ai_model_mode: string | null
          ai_scheduling_enabled: boolean | null
          async_booking_enabled: boolean | null
          audio_response_enabled: boolean | null
          auto_followup_enabled: boolean | null
          auto_response_enabled: boolean
          available_time_slots: Json
          business_days: number[]
          business_hours_end: string
          business_hours_start: string
          company_name: string | null
          created_at: string
          default_visit_duration: number
          elevenlabs_api_key: string | null
          elevenlabs_model: string | null
          elevenlabs_similarity_boost: number
          elevenlabs_speaker_boost: boolean
          elevenlabs_speed: number | null
          elevenlabs_stability: number
          elevenlabs_style: number
          elevenlabs_voice_id: string
          google_calendar_id: string | null
          google_client_id: string | null
          google_client_secret: string | null
          google_refresh_token: string | null
          id: string
          is_active: boolean
          message_breaking_enabled: boolean
          response_delay_max: number
          response_delay_min: number
          route_all_to_receiver_enabled: boolean
          scoring_weights: Json | null
          sdr_name: string | null
          system_prompt_override: string | null
          test_phone_numbers: Json | null
          test_system_prompt: string | null
          timezone: string
          updated_at: string
          user_id: string | null
          whatsapp_access_token: string | null
          whatsapp_business_account_id: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_verify_token: string | null
        }
        Insert: {
          adaptive_response_enabled?: boolean
          ai_model_mode?: string | null
          ai_scheduling_enabled?: boolean | null
          async_booking_enabled?: boolean | null
          audio_response_enabled?: boolean | null
          auto_followup_enabled?: boolean | null
          auto_response_enabled?: boolean
          available_time_slots?: Json
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          company_name?: string | null
          created_at?: string
          default_visit_duration?: number
          elevenlabs_api_key?: string | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number
          elevenlabs_speaker_boost?: boolean
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          google_calendar_id?: string | null
          google_client_id?: string | null
          google_client_secret?: string | null
          google_refresh_token?: string | null
          id?: string
          is_active?: boolean
          message_breaking_enabled?: boolean
          response_delay_max?: number
          response_delay_min?: number
          route_all_to_receiver_enabled?: boolean
          scoring_weights?: Json | null
          sdr_name?: string | null
          system_prompt_override?: string | null
          test_phone_numbers?: Json | null
          test_system_prompt?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_verify_token?: string | null
        }
        Update: {
          adaptive_response_enabled?: boolean
          ai_model_mode?: string | null
          ai_scheduling_enabled?: boolean | null
          async_booking_enabled?: boolean | null
          audio_response_enabled?: boolean | null
          auto_followup_enabled?: boolean | null
          auto_response_enabled?: boolean
          available_time_slots?: Json
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          company_name?: string | null
          created_at?: string
          default_visit_duration?: number
          elevenlabs_api_key?: string | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number
          elevenlabs_speaker_boost?: boolean
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          google_calendar_id?: string | null
          google_client_id?: string | null
          google_client_secret?: string | null
          google_refresh_token?: string | null
          id?: string
          is_active?: boolean
          message_breaking_enabled?: boolean
          response_delay_max?: number
          response_delay_min?: number
          route_all_to_receiver_enabled?: boolean
          scoring_weights?: Json | null
          sdr_name?: string | null
          system_prompt_override?: string | null
          test_phone_numbers?: Json | null
          test_system_prompt?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_verify_token?: string | null
        }
        Relationships: []
      }
      objections_playbook: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          response_text: string
          title: string
          triggers: string[]
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          response_text: string
          title: string
          triggers?: string[]
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          response_text?: string
          title?: string
          triggers?: string[]
          updated_at?: string | null
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          ai_trigger_criteria: string | null
          color: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_ai_managed: boolean | null
          is_system: boolean | null
          position: number
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_trigger_criteria?: string | null
          color?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_ai_managed?: boolean | null
          is_system?: boolean | null
          position?: number
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_trigger_criteria?: string | null
          color?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_ai_managed?: boolean | null
          is_system?: boolean | null
          position?: number
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          force_password_change: boolean
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          force_password_change?: boolean
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          force_password_change?: boolean
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          created_at: string | null
          created_by: string | null
          deal_id: string
          file_path: string
          id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          file_path: string
          id?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          file_path?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          shortcut: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          shortcut: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          shortcut?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      send_queue: {
        Row: {
          contact_id: string
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          from_type: string
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          priority: number
          retry_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          content?: string | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          from_type?: string
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          priority?: number
          retry_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          from_type?: string
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          priority?: number
          retry_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "send_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_alerts: {
        Row: {
          assigned_user_id: string | null
          contact_id: string
          conversation_id: string
          created_at: string
          id: string
          last_client_message_at: string
          level: Database["public"]["Enums"]["sla_level"]
          resolved: boolean
          resolved_at: string | null
          suggested_message: string | null
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          contact_id: string
          conversation_id: string
          created_at?: string
          id?: string
          last_client_message_at: string
          level: Database["public"]["Enums"]["sla_level"]
          resolved?: boolean
          resolved_at?: string | null
          suggested_message?: string | null
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          last_client_message_at?: string
          level?: Database["public"]["Enums"]["sla_level"]
          resolved?: boolean
          resolved_at?: string | null
          suggested_message?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_alerts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_alerts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_alerts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_definitions: {
        Row: {
          category: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      team_functions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          avatar: string | null
          created_at: string
          email: string
          function_id: string | null
          google_calendar_email: string | null
          id: string
          last_active: string | null
          name: string
          role: Database["public"]["Enums"]["member_role"]
          rr_counter: number
          status: Database["public"]["Enums"]["member_status"]
          team_id: string | null
          updated_at: string
          user_id: string | null
          weight: number | null
          whatsapp_number: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          email: string
          function_id?: string | null
          google_calendar_email?: string | null
          id?: string
          last_active?: string | null
          name: string
          role?: Database["public"]["Enums"]["member_role"]
          rr_counter?: number
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
          weight?: number | null
          whatsapp_number?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string
          email?: string
          function_id?: string | null
          google_calendar_email?: string | null
          id?: string
          last_active?: string | null
          name?: string
          role?: Database["public"]["Enums"]["member_role"]
          rr_counter?: number
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
          weight?: number | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "team_functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          content: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          language: string
          name: string
          updated_at: string
          variables: Json
        }
        Insert: {
          content: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          language?: string
          name: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          content?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          language?: string
          name?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
    }
    Views: {
      contacts_with_stats: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          call_name: string | null
          client_memory: Json | null
          created_at: string | null
          email: string | null
          first_contact_date: string | null
          human_messages: number | null
          id: string | null
          is_blocked: boolean | null
          is_business: boolean | null
          last_activity: string | null
          name: string | null
          nina_messages: number | null
          notes: string | null
          phone_number: string | null
          profile_picture_url: string | null
          tags: string[] | null
          total_messages: number | null
          updated_at: string | null
          user_id: string | null
          user_messages: number | null
          whatsapp_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_conversation_now: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      claim_message_processing_batch: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          error_message: string | null
          id: string
          phone_number_id: string
          priority: number
          processed_at: string | null
          raw_data: Json
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          whatsapp_message_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "message_processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_nina_processing_batch: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          context_data: Json | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          priority: number
          processed_at: string | null
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "nina_processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_send_queue_batch: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          from_type: string
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          priority: number
          retry_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "send_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_processed_message_queue: { Args: never; Returns: undefined }
      cleanup_processed_queues: { Args: never; Returns: undefined }
      current_tenant_id: { Args: never; Returns: string }
      get_auth_user_id: { Args: never; Returns: string }
      get_or_create_conversation_state: {
        Args: { p_conversation_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mika_nina_contacts_by_tag: { Args: { tag: string }; Returns: Json }
      mika_nina_contacts_recent: { Args: never; Returns: Json }
      mika_nina_conversations_active: { Args: never; Returns: Json }
      mika_nina_messages_recent: { Args: never; Returns: Json }
      mika_nina_search_contact: { Args: { nome: string }; Returns: Json }
      mika_nina_summary: { Args: never; Returns: Json }
      search_knowledge: {
        Args: { p_query: string; p_tenant_id?: string; p_top_k?: number }
        Returns: {
          category: string
          chunk_index: number
          content: string
          rank: number
          source_id: string
          title: string
        }[]
      }
      update_client_memory: {
        Args: { p_contact_id: string; p_new_memory: Json }
        Returns: undefined
      }
      update_conversation_state: {
        Args: {
          p_action?: string
          p_context?: Json
          p_conversation_id: string
          p_new_state: string
        }
        Returns: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user"
      appointment_type: "demo" | "meeting" | "support" | "followup"
      conversation_status: "nina" | "human" | "paused"
      member_role: "admin" | "manager" | "agent"
      member_status: "active" | "invited" | "disabled"
      message_from: "user" | "nina" | "human"
      message_status: "sent" | "delivered" | "read" | "failed" | "processing"
      message_type: "text" | "audio" | "image" | "document" | "video"
      queue_status: "pending" | "processing" | "completed" | "failed"
      sla_level: "respond_now" | "loss_risk" | "stalled"
      team_assignment: "mateus" | "igor" | "fe" | "vendas" | "suporte"
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
      app_role: ["admin", "user"],
      appointment_type: ["demo", "meeting", "support", "followup"],
      conversation_status: ["nina", "human", "paused"],
      member_role: ["admin", "manager", "agent"],
      member_status: ["active", "invited", "disabled"],
      message_from: ["user", "nina", "human"],
      message_status: ["sent", "delivered", "read", "failed", "processing"],
      message_type: ["text", "audio", "image", "document", "video"],
      queue_status: ["pending", "processing", "completed", "failed"],
      sla_level: ["respond_now", "loss_risk", "stalled"],
      team_assignment: ["mateus", "igor", "fe", "vendas", "suporte"],
    },
  },
} as const
