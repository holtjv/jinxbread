let targetId = cu.customer_id

      if (customer.is_admin) {
        setIsAdmin(true)
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name')
          .eq('active', true)
          .order('name')
        setAllCustomers(customers || [])
        const stored = sessionStorage.getItem('adminSelectedCustomerId')
        if (stored) targetId = stored
      } else {
        sessionStorage.removeItem('adminSelectedCustomerId')
        sessionStorage.removeItem('adminSelectedCustomerName')
      }