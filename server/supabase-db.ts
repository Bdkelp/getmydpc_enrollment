import { createClient } from '@supabase/supabase-js';
import * as schema from "@shared/schema";
import { eq, desc, and, or, like, sql } from "drizzle-orm";

// Initialize Supabase client
const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.replace(/^'|'$/g, '') || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
  throw new Error(
    "SUPABASE_SERVICE_KEY and SUPABASE_URL must be set. Did you forget to configure Supabase?",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

// Helper to convert Drizzle conditions to Supabase filters
function parseCondition(condition: any): { column: string; op: string; value: any } | null {
  if (!condition) return null;
  
  // Handle eq() conditions
  if (condition._ && condition._.is && condition._.is.name === 'eq') {
    return { 
      column: condition.left.name,
      op: 'eq',
      value: condition.right
    };
  }
  
  // Handle like() conditions
  if (condition._ && condition._.is && condition._.is.name === 'like') {
    return {
      column: condition.left.name,
      op: 'like',
      value: condition.right
    };
  }
  
  // Direct object condition (for simple matching)
  if (typeof condition === 'object' && !condition._) {
    return { column: Object.keys(condition)[0], op: 'eq', value: Object.values(condition)[0] };
  }
  
  return null;
}

// Helper to get table name from Drizzle table object
function getTableName(table: any): string {
  // Try to get the table name from the Drizzle symbol
  const nameSymbol = Symbol.for('drizzle:Name');
  if (table[nameSymbol]) {
    return table[nameSymbol];
  }
  // Fallback to string if passed directly
  return typeof table === 'string' ? table : 'unknown';
}

// Create a Drizzle-compatible interface using Supabase client
export const db = {
  select: (fields?: any) => ({
    from: (table: any) => {
      const tableName = getTableName(table);
      
      return {
        where: (condition?: any) => ({
          execute: async () => {
            let query = supabase.from(tableName).select('*');
            
            const parsed = parseCondition(condition);
            if (parsed) {
              if (parsed.op === 'eq') {
                query = query.eq(parsed.column, parsed.value);
              } else if (parsed.op === 'like') {
                query = query.like(parsed.column, parsed.value);
              }
            }
            
            const { data, error } = await query;
            if (error) {
              console.error(`Error fetching from ${tableName}:`, error);
              throw error;
            }
            return data || [];
          },
          orderBy: (orderField: any, orderDirection?: any) => ({
            execute: async () => {
              let query = supabase.from(tableName).select('*');
              
              const parsed = parseCondition(condition);
              if (parsed) {
                if (parsed.op === 'eq') {
                  query = query.eq(parsed.column, parsed.value);
                } else if (parsed.op === 'like') {
                  query = query.like(parsed.column, parsed.value);
                }
              }
              
              // Handle order
              const fieldName = orderField?.name || orderField;
              const isDesc = orderDirection?._ && orderDirection._.name === 'desc';
              if (fieldName) {
                query = query.order(fieldName, { ascending: !isDesc });
              }
              
              const { data, error } = await query;
              if (error) throw error;
              return data || [];
            },
            limit: (n: number) => ({
              offset: (o: number) => ({
                execute: async () => {
                  let query = supabase.from(tableName).select('*');
                  
                  const parsed = parseCondition(condition);
                  if (parsed) {
                    if (parsed.op === 'eq') {
                      query = query.eq(parsed.column, parsed.value);
                    } else if (parsed.op === 'like') {
                      query = query.like(parsed.column, parsed.value);
                    }
                  }
                  
                  const fieldName = orderField?.name || orderField;
                  const isDesc = orderDirection?._ && orderDirection._.name === 'desc';
                  if (fieldName) {
                    query = query.order(fieldName, { ascending: !isDesc });
                  }
                  
                  query = query.range(o, o + n - 1);
                  
                  const { data, error } = await query;
                  if (error) throw error;
                  return data || [];
                }
              })
            })
          }),
          limit: (n: number) => ({
            execute: async () => {
              let query = supabase.from(tableName).select('*');
              
              const parsed = parseCondition(condition);
              if (parsed) {
                if (parsed.op === 'eq') {
                  query = query.eq(parsed.column, parsed.value);
                } else if (parsed.op === 'like') {
                  query = query.like(parsed.column, parsed.value);
                }
              }
              
              query = query.limit(n);
              
              const { data, error } = await query;
              if (error) throw error;
              return data || [];
            }
          })
        }),
        execute: async () => {
          const { data, error } = await supabase.from(tableName).select('*');
          if (error) {
            console.error(`Error fetching all from ${tableName}:`, error);
            throw error;
          }
          return data || [];
        },
        orderBy: (orderField: any, orderDirection?: any) => ({
          execute: async () => {
            const fieldName = orderField?.name || orderField;
            const isDesc = orderDirection?._ && orderDirection._.name === 'desc';
            
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .order(fieldName, { ascending: !isDesc });
              
            if (error) throw error;
            return data || [];
          },
          limit: (n: number) => ({
            offset: (o: number) => ({
              execute: async () => {
                const fieldName = orderField?.name || orderField;
                const isDesc = orderDirection?._ && orderDirection._.name === 'desc';
                
                const { data, error } = await supabase
                  .from(tableName)
                  .select('*')
                  .order(fieldName, { ascending: !isDesc })
                  .range(o, o + n - 1);
                  
                if (error) throw error;
                return data || [];
              }
            }),
            execute: async () => {
              const fieldName = orderField?.name || orderField;
              const isDesc = orderDirection?._ && orderDirection._.name === 'desc';
              
              const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .order(fieldName, { ascending: !isDesc })
                .limit(n);
                
              if (error) throw error;
              return data || [];
            }
          })
        }),
        limit: (n: number) => ({
          offset: (o: number) => ({
            execute: async () => {
              const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .range(o, o + n - 1);
                
              if (error) throw error;
              return data || [];
            }
          }),
          execute: async () => {
            const { data, error } = await supabase
              .from(tableName)
              .select('*')
              .limit(n);
              
            if (error) throw error;
            return data || [];
          }
        })
      };
    }
  }),
  
  insert: (table: any) => ({
    values: (values: any) => ({
      returning: () => ({
        execute: async () => {
          const tableName = getTableName(table);
          const { data, error } = await supabase.from(tableName).insert(values).select();
          if (error) {
            console.error(`Error inserting into ${tableName}:`, error);
            throw error;
          }
          return data;
        }
      }),
      execute: async () => {
        const tableName = getTableName(table);
        const { data, error } = await supabase.from(tableName).insert(values).select();
        if (error) {
          console.error(`Error inserting into ${tableName}:`, error);
          throw error;
        }
        return data;
      }
    })
  }),
  
  update: (table: any) => ({
    set: (values: any) => ({
      where: (condition: any) => ({
        returning: () => ({
          execute: async () => {
            const tableName = getTableName(table);
            let query = supabase.from(tableName).update(values);
            
            const parsed = parseCondition(condition);
            if (parsed && parsed.op === 'eq') {
              query = query.eq(parsed.column, parsed.value);
            }
            
            const { data, error } = await query.select();
            if (error) throw error;
            return data;
          }
        }),
        execute: async () => {
          const tableName = getTableName(table);
          let query = supabase.from(tableName).update(values);
          
          const parsed = parseCondition(condition);
          if (parsed && parsed.op === 'eq') {
            query = query.eq(parsed.column, parsed.value);
          }
          
          const { data, error } = await query.select();
          if (error) throw error;
          return data;
        }
      })
    })
  }),
  
  delete: (table: any) => ({
    where: (condition: any) => ({
      execute: async () => {
        const tableName = getTableName(table);
        let query = supabase.from(tableName).delete();
        
        const parsed = parseCondition(condition);
        if (parsed && parsed.op === 'eq') {
          query = query.eq(parsed.column, parsed.value);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        return data;
      }
    })
  })
};

// Export pool for compatibility with raw SQL queries
export const pool = {
  query: async (text: string, params?: any[]) => {
    // For raw SQL, we need to use Supabase RPC or parse the query
    // For now, return empty rows for unsupported queries
    console.log('Raw SQL query attempted:', text);
    
    // Handle COUNT queries
    if (text.toLowerCase().includes('count(*)')) {
      const tableMatch = text.match(/from\s+"?(\w+)"?/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        const { count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        return { rows: [{ count: count || 0 }] };
      }
    }
    
    // For other queries, return empty
    return { rows: [] };
  },
  end: async () => {
    // No-op for Supabase client
  }
};

// Export for direct use
export { supabase };