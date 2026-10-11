// Hand-written mirror of the Supabase schema in supabase/migrations.
// Keep in sync with the migrations — this is what makes every query typed.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AccountType = "CHECKING" | "SAVINGS";
export type AccountStatus = "ACTIVE" | "FROZEN" | "CLOSED";
export type TxnDirection = "CREDIT" | "DEBIT";
export type TxnType = "TRANSFER_IN" | "TRANSFER_OUT" | "DEPOSIT" | "WITHDRAWAL";
export type TxnStatus = "COMPLETED" | "FAILED" | "PENDING";
export type CardStatus = "ACTIVE" | "FROZEN";
export type CashDirection = "DEPOSIT" | "WITHDRAWAL";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          phone?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          type: AccountType;
          account_number: string;
          ifsc: string;
          balance: number;
          currency: string;
          status: AccountStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: AccountType;
          account_number: string;
          ifsc?: string;
          balance?: number;
          currency?: string;
          status?: AccountStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: AccountType;
          account_number?: string;
          ifsc?: string;
          balance?: number;
          currency?: string;
          status?: AccountStatus;
          created_at?: string;
        };
        Relationships: [];
      };
      beneficiaries: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          account_number: string;
          ifsc: string;
          nickname: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          account_number: string;
          ifsc: string;
          nickname?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          account_number?: string;
          ifsc?: string;
          nickname?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          reference: string;
          account_id: string;
          counterparty_account_id: string | null;
          direction: TxnDirection;
          txn_type: TxnType;
          amount: number;
          balance_after: number;
          memo: string | null;
          status: TxnStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          reference: string;
          account_id: string;
          counterparty_account_id?: string | null;
          direction: TxnDirection;
          txn_type: TxnType;
          amount: number;
          balance_after: number;
          memo?: string | null;
          status?: TxnStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          reference?: string;
          account_id?: string;
          counterparty_account_id?: string | null;
          direction?: TxnDirection;
          txn_type?: TxnType;
          amount?: number;
          balance_after?: number;
          memo?: string | null;
          status?: TxnStatus;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_counterparty_account_id_fkey";
            columns: ["counterparty_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      cards: {
        Row: {
          id: string;
          account_id: string;
          last4: string;
          network: string;
          holder_name: string;
          expiry_month: number;
          expiry_year: number;
          status: CardStatus;
          daily_limit: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          last4: string;
          network?: string;
          holder_name: string;
          expiry_month: number;
          expiry_year: number;
          status?: CardStatus;
          daily_limit?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          last4?: string;
          network?: string;
          holder_name?: string;
          expiry_month?: number;
          expiry_year?: number;
          status?: CardStatus;
          daily_limit?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cards_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          body: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          body?: string;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "assistant";
          parts: Json;
          client_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "assistant";
          parts?: Json;
          client_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: "user" | "assistant";
          parts?: Json;
          client_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      firewall_logs: {
        Row: {
          id: string;
          user_id: string;
          surface: "chat" | "memo" | "console" | "confirm";
          input: string;
          status: "APPROVED" | "BLOCKED";
          risk_score: number;
          threat_category: string;
          explanation: string;
          deciding_layer: "L0" | "L1" | "L2" | "L3" | "FAIL_CLOSED";
          signals: Json;
          layer_details: Json;
          intent: string | null;
          latency_ms: number;
          executed: boolean;
          audit: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          surface: "chat" | "memo" | "console" | "confirm";
          input: string;
          status: "APPROVED" | "BLOCKED";
          risk_score: number;
          threat_category: string;
          explanation: string;
          deciding_layer: "L0" | "L1" | "L2" | "L3" | "FAIL_CLOSED";
          signals?: Json;
          layer_details?: Json;
          intent?: string | null;
          latency_ms?: number;
          executed?: boolean;
          audit?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          surface?: "chat" | "memo" | "console" | "confirm";
          input?: string;
          status?: "APPROVED" | "BLOCKED";
          risk_score?: number;
          threat_category?: string;
          explanation?: string;
          deciding_layer?: "L0" | "L1" | "L2" | "L3" | "FAIL_CLOSED";
          signals?: Json;
          layer_details?: Json;
          intent?: string | null;
          latency_ms?: number;
          executed?: boolean;
          audit?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      perform_transfer: {
        Args: {
          from_account_id: string;
          to_account_number: string;
          amount: number;
          memo: string | null;
        };
        Returns: string;
      };
      cash_transaction: {
        Args: {
          account_id: string;
          direction: string;
          amount: number;
          memo: string | null;
        };
        Returns: string;
      };
      issue_confirmation_token: {
        Args: {
          p_tool_name: string;
          p_params: Json;
          p_conversation_id?: string | null;
        };
        Returns: Json;
      };
      redeem_confirmation_token: {
        Args: {
          p_token_id: string;
        };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type Beneficiary = Database["public"]["Tables"]["beneficiaries"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type Card = Database["public"]["Tables"]["cards"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
export type FirewallLog = Database["public"]["Tables"]["firewall_logs"]["Row"];
