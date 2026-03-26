// ==========================================
// SUPABASE CLIENT CONFIGURATION
// ==========================================

// Futuras credenciais do projeto (URL e Chave Pública/Anon)
const SUPABASE_URL = 'https://uzziktrvczffrudbbqsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6emlrdHJ2Y3pmZnJ1ZGJicXN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODQzMTQsImV4cCI6MjA5MDA2MDMxNH0.3DCuYkvS4DOlLZVYrWfLQBNifRHdD8hoo43vvm7EMPQ';

// Inicializa a instância do Supabase globalmente usando a variável global 'supabase' gerada pelo CDN
let supabaseClient = null;
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("Erro fatal ao inicializar Supabase Client:", e);
    alert("Erro ao conectar base de dados. O bloqueador de anúncios ou antivírus pode estar barrando a conexão.");
}

// Variável global para armazenar estado de login e autenticação
let currentUser = null;

// ==========================================
// ESTRUTURA PARA FUNÇÕES DO SUPABASE
// ==========================================

window.db = {
    auth: {
        async login(email, password) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            return { data, error };
        },
        async signup(email, password) {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            return { data, error };
        },
        async logout() {
            await supabaseClient.auth.signOut();
            window.location.reload();
        },
        async getUser() {
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            return session ? session.user : null;
        },
        async resetPassword(email) {
            const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email);
            return { data, error };
        }
    },
    vehicles: {
        async getAll() {
            const { data, error } = await supabaseClient
                .from('vehicles')
                .select('*')
                .order('created_at', { ascending: true });
            return { data, error };
        },
        async add(vehicle) {
            // Remove local ID, supabase handles UUID generate
            delete vehicle.id; 
            vehicle.user_id = currentUser.id;
            const { data, error } = await supabaseClient
                .from('vehicles')
                .insert([vehicle])
                .select();
            return { data, error };
        },
        async update(id, vehicle) {
            const { data, error } = await supabaseClient
                .from('vehicles')
                .update(vehicle)
                .eq('id', id)
                .select();
            return { data, error };
        },
        async delete(id) {
            const { error } = await supabaseClient
                .from('vehicles')
                .delete()
                .eq('id', id);
            return { error };
        }
    },
    fuel: {
        async getAll() {
            const { data, error } = await supabaseClient
                .from('fuel_logs')
                .select('*')
                .order('date', { ascending: false });
            return { data, error };
        },
        async add(log) {
            delete log.id; // DB creates UUID
            log.user_id = currentUser.id;
            const { data, error } = await supabaseClient
                .from('fuel_logs')
                .insert([log])
                .select();
            return { data, error };
        },
        async update(id, log) {
            delete log.id;
            delete log.user_id;
            const { data, error } = await supabaseClient
                .from('fuel_logs')
                .update(log)
                .eq('id', id)
                .select();
            return { data, error };
        },
        async delete(id) {
            const { error } = await supabaseClient
                .from('fuel_logs')
                .delete()
                .eq('id', id);
            return { error };
        }
    },
    maintenance: {
        async getAll() {
            const { data, error } = await supabaseClient
                .from('maintenance_logs')
                .select('*')
                .order('date', { ascending: false });
            return { data, error };
        },
        async add(log) {
            delete log.id;
            log.user_id = currentUser.id;
            const { data, error } = await supabaseClient
                .from('maintenance_logs')
                .insert([log])
                .select();
            return { data, error };
        },
        async update(id, log) {
            delete log.id;
            delete log.user_id;
            const { data, error } = await supabaseClient
                .from('maintenance_logs')
                .update(log)
                .eq('id', id)
                .select();
            return { data, error };
        },
        async delete(id) {
            const { error } = await supabaseClient
                .from('maintenance_logs')
                .delete()
                .eq('id', id);
            return { error };
        }
    },
    costs: {
        async getAll() {
            const { data, error } = await supabaseClient
                .from('costs_logs')
                .select('*')
                .order('date', { ascending: false });
            return { data, error };
        },
        async add(log) {
            delete log.id;
            log.user_id = currentUser.id;
            const { data, error } = await supabaseClient
                .from('costs_logs')
                .insert([log])
                .select();
            return { data, error };
        },
        async delete(id) {
            const { error } = await supabaseClient
                .from('costs_logs')
                .delete()
                .eq('id', id);
            return { error };
        }
    },
    billing: {
        async getAll() {
            const { data, error } = await supabaseClient
                .from('billing_logs')
                .select('*')
                .order('date', { ascending: false });
            return { data, error };
        },
        async add(log) {
            delete log.id;
            log.user_id = currentUser.id;
            const { data, error } = await supabaseClient
                .from('billing_logs')
                .insert([log])
                .select();
            return { data, error };
        },
        async delete(id) {
            const { error } = await supabaseClient
                .from('billing_logs')
                .delete()
                .eq('id', id);
            return { error };
        }
    },
    documents: {
        async getAll() {
            const { data, error } = await supabaseClient
                .from('documents')
                .select('*')
                .order('created_at', { ascending: false });
            return { data, error };
        },
        async add(docData, file) {
            docData.user_id = currentUser.id;
            const fileExt = file.name ? file.name.split('.').pop() : (file.type === 'application/pdf' ? 'pdf' : 'jpg');
            const fileName = `${currentUser.id}/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${fileExt}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('motrix_docs')
                .upload(fileName, file, { cacheControl: '3600', upsert: false });
                
            if (uploadError) return { error: uploadError };
            
            const { data: publicUrlData } = supabaseClient.storage
                .from('motrix_docs')
                .getPublicUrl(fileName);
                
            docData.file_url = publicUrlData.publicUrl;
            
            const { data, error } = await supabaseClient
                .from('documents')
                .insert([docData])
                .select();
            return { data, error };
        },
        async delete(id, fileUrl) {
            const { error } = await supabaseClient
                .from('documents')
                .delete()
                .eq('id', id);
                
            if (error) return { error };
            
            try {
                // Try to extract the file path to remove from storage
                const urlObj = new URL(fileUrl);
                const pathParts = urlObj.pathname.split('/motrix_docs/');
                if (pathParts.length > 1) {
                    const filePath = decodeURIComponent(pathParts[1]);
                    await supabaseClient.storage.from('motrix_docs').remove([filePath]);
                }
            } catch(e) {
                console.error("Erro ao excluir do storage", e);
            }
            return { error: null };
        }
    }
};
