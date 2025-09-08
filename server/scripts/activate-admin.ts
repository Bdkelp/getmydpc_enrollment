import { supabase } from '../lib/supabaseClient';

async function activateAdmin() {
  try {
    console.log('Checking admin account...');
    
    // First check what columns exist and the current user data
    const { data: checkData, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'michael@mypremierplans.com')
      .single();
    
    if (checkError && checkError.code === 'PGRST116') {
      console.log('User not found, creating admin user...');
      
      // Create the user if it doesn't exist
      const { data: insertData, error: insertError } = await supabase
        .from('users')
        .insert({
          id: '8bda1072-ab65-4733-a84b-2a3609a69450', // Use the ID from Supabase Auth
          email: 'michael@mypremierplans.com',
          role: 'admin',
          is_active: true,
          first_name: 'Michael',
          last_name: 'Admin'
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Error creating user:', insertError);
        // Try simpler insert
        const { data: simpleInsert, error: simpleError } = await supabase
          .from('users')
          .insert({
            id: '8bda1072-ab65-4733-a84b-2a3609a69450',
            email: 'michael@mypremierplans.com',
            is_active: true
          })
          .select()
          .single();
        
        if (simpleError) {
          console.error('Even simple insert failed:', simpleError);
        } else {
          console.log('Created basic user:', simpleInsert);
        }
      } else {
        console.log('Admin user created:', insertData);
      }
    } else if (checkError) {
      console.error('Error checking user:', checkError);
    } else if (checkData) {
      console.log('Current user data:', checkData);
      
      // Update only the fields that exist (using snake_case for database)
      const updateFields: any = { is_active: true };
      
      // Check which fields exist and update them
      if ('role' in checkData) updateFields.role = 'admin';
      if ('first_name' in checkData) updateFields.first_name = 'Michael';
      if ('last_name' in checkData) updateFields.last_name = 'Admin';
      if ('approval_status' in checkData) updateFields.approval_status = 'approved';
      
      const { data, error } = await supabase
        .from('users')
        .update(updateFields)
        .eq('email', 'michael@mypremierplans.com')
        .select()
        .single();
      
      if (error) {
        console.error('Error updating user:', error);
      } else {
        console.log('Admin account updated successfully:', data);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

activateAdmin();