// ==========================================
// FIREBASE CLIENT CONFIGURATION
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyD-K59BS-3t6Jw9o--yhUVTrOZuF00NAhI",
    authDomain: "motrix-18f53.firebaseapp.com",
    projectId: "motrix-18f53",
    storageBucket: "motrix-18f53.firebasestorage.app",
    messagingSenderId: "235381908817",
    appId: "1:235381908817:web:5cef07a0e39ba842ed5f70",
    measurementId: "G-GPFV7V4XR8"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const fbDb = firebase.firestore();
const storage = firebase.storage();

// Variável global para compartilhar o estado com app.js
var currentUser = null;

// Para alinhar currentUser com o app.js
auth.onAuthStateChanged(user => {
    currentUser = user;
    window.currentUser = user;
});

// ==========================================
// ESTRUTURA PARA FUNÇÕES (MANTENDO A MESMA ASSINATURA DO SUPABASE)
// ==========================================

window.db = {
    auth: {
        async login(email, password) {
            try {
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                return { data: { user: userCredential.user }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        async signup(email, password) {
            try {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                return { data: { user: userCredential.user, session: {} }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        async logout() {
            await auth.signOut();
            localStorage.removeItem('motrix_state');
            window.location.reload();
        },
        async getUser() {
            return new Promise((resolve) => {
                const unsubscribe = auth.onAuthStateChanged(user => {
                    unsubscribe();
                    resolve(user);
                });
            });
        },
        async resetPassword(email) {
            try {
                await auth.sendPasswordResetEmail(email);
                return { data: true, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        async signInWithGoogle() {
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                const userCredential = await auth.signInWithPopup(provider);
                return { data: { user: userCredential.user }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
    },
    vehicles: {
        async getAll() {
            try {
                const user = auth.currentUser || currentUser;
                if(!user) return {data: [], error: null};
                const snapshot = await fbDb.collection('vehicles')
                    .where('user_id', '==', user.uid)
                    .orderBy('created_at', 'asc').get();
                return { data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null };
            } catch (error) {
                console.warn("Erro ao buscar veículos com ordenação:", error);
                try {
                    const user = auth.currentUser || currentUser;
                    const snapshot = await fbDb.collection('vehicles').where('user_id', '==', user.uid).get();
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (a.created_at || '').localeCompare(a.created_at || ''));
                    return { data, error: null };
                } catch (fallbackError) {
                    console.error("Erro no fallback de veículos:", fallbackError);
                    return { data: null, error: fallbackError };
                }
            }
        },
        async add(vehicle) {
            try {
                const user = auth.currentUser || currentUser;
                vehicle.user_id = user.uid;
                vehicle.created_at = new Date().toISOString();
                const docRef = await fbDb.collection('vehicles').add(vehicle);
                vehicle.id = docRef.id;
                return { data: [vehicle], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async update(id, vehicle) {
            try {
                await fbDb.collection('vehicles').doc(id).update(vehicle);
                vehicle.id = id;
                return { data: [vehicle], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async delete(id) {
            try {
                await fbDb.collection('vehicles').doc(id).delete();
                return { error: null };
            } catch (error) { return { error }; }
        }
    },
    fuel: {
        async getAll() {
            try {
                const user = auth.currentUser || currentUser;
                if(!user) return {data: [], error: null};
                const snapshot = await fbDb.collection('fuel_logs')
                    .where('user_id', '==', user.uid)
                    .orderBy('date', 'desc').get();
                return { data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null };
            } catch (error) { 
                console.warn("Erro ao buscar abastecimentos com ordenação:", error);
                try {
                    const user = auth.currentUser || currentUser;
                    const snapshot = await fbDb.collection('fuel_logs').where('user_id', '==', user.uid).get();
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
                    return { data, error: null };
                } catch (fallbackError) {
                    console.error("Erro no fallback de abastecimentos:", fallbackError);
                    return { data: null, error: fallbackError };
                }
            }
        },
        async add(log) {
            try {
                const user = auth.currentUser || currentUser;
                log.user_id = user.uid;
                const docRef = await fbDb.collection('fuel_logs').add(log);
                log.id = docRef.id;
                return { data: [log], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async update(id, log) {
            try {
                await fbDb.collection('fuel_logs').doc(id).update(log);
                log.id = id;
                return { data: [log], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async delete(id) {
            try {
                await fbDb.collection('fuel_logs').doc(id).delete();
                return { error: null };
            } catch (error) { return { error }; }
        }
    },
    maintenance: {
        async getAll() {
            try {
                const user = auth.currentUser || currentUser;
                if(!user) return {data: [], error: null};
                const snapshot = await fbDb.collection('maintenance_logs')
                    .where('user_id', '==', user.uid)
                    .orderBy('date', 'desc').get();
                return { data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null };
            } catch (error) { 
                console.warn("Erro ao buscar manutenções com ordenação:", error);
                try {
                    const user = auth.currentUser || currentUser;
                    const snapshot = await fbDb.collection('maintenance_logs').where('user_id', '==', user.uid).get();
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
                    return { data, error: null };
                } catch (fallbackError) {
                    console.error("Erro no fallback de manutenções:", fallbackError);
                    return { data: null, error: fallbackError };
                }
            }
        },
        async add(log) {
            try {
                const user = auth.currentUser || currentUser;
                log.user_id = user.uid;
                const docRef = await fbDb.collection('maintenance_logs').add(log);
                log.id = docRef.id;
                return { data: [log], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async update(id, log) {
            try {
                await fbDb.collection('maintenance_logs').doc(id).update(log);
                log.id = id;
                return { data: [log], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async delete(id) {
            try {
                await fbDb.collection('maintenance_logs').doc(id).delete();
                return { error: null };
            } catch (error) { return { error }; }
        }
    },
    costs: {
        async getAll() {
            try {
                const user = auth.currentUser || currentUser;
                if(!user) return {data: [], error: null};
                const snapshot = await fbDb.collection('costs_logs')
                    .where('user_id', '==', user.uid)
                    .orderBy('date', 'desc').get();
                return { data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null };
            } catch (error) { 
                console.warn("Erro ao buscar despesas com ordenação:", error);
                try {
                    const user = auth.currentUser || currentUser;
                    const snapshot = await fbDb.collection('costs_logs').where('user_id', '==', user.uid).get();
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
                    return { data, error: null };
                } catch (fallbackError) {
                    console.error("Erro no fallback de despesas:", fallbackError);
                    return { data: null, error: fallbackError };
                }
            }
        },
        async add(log) {
            try {
                const user = auth.currentUser || currentUser;
                log.user_id = user.uid;
                const docRef = await fbDb.collection('costs_logs').add(log);
                log.id = docRef.id;
                return { data: [log], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async delete(id) {
            try {
                await fbDb.collection('costs_logs').doc(id).delete();
                return { error: null };
            } catch (error) { return { error }; }
        }
    },
    billing: {
        async getAll() {
            try {
                const user = auth.currentUser || currentUser;
                if(!user) return {data: [], error: null};
                const snapshot = await fbDb.collection('billing_logs')
                    .where('user_id', '==', user.uid)
                    .orderBy('date', 'desc').get();
                return { data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null };
            } catch (error) { 
                console.warn("Erro ao buscar ganhos com ordenação:", error);
                try {
                    const user = auth.currentUser || currentUser;
                    const snapshot = await fbDb.collection('billing_logs').where('user_id', '==', user.uid).get();
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
                    return { data, error: null };
                } catch (fallbackError) {
                    console.error("Erro no fallback de ganhos:", fallbackError);
                    return { data: null, error: fallbackError };
                }
            }
        },
        async add(log) {
            try {
                const user = auth.currentUser || currentUser;
                log.user_id = user.uid;
                const docRef = await fbDb.collection('billing_logs').add(log);
                log.id = docRef.id;
                return { data: [log], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async delete(id) {
            try {
                await fbDb.collection('billing_logs').doc(id).delete();
                return { error: null };
            } catch (error) { return { error }; }
        }
    },
    documents: {
        async getAll() {
            try {
                const user = auth.currentUser || currentUser;
                if(!user) return {data: [], error: null};
                const snapshot = await fbDb.collection('documents')
                    .where('user_id', '==', user.uid)
                    .orderBy('created_at', 'desc').get();
                return { data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null };
            } catch (error) { 
                console.warn("Erro ao buscar documentos com ordenação:", error);
                try {
                    const user = auth.currentUser || currentUser;
                    const snapshot = await fbDb.collection('documents').where('user_id', '==', user.uid).get();
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
                    return { data, error: null };
                } catch (fallbackError) {
                    console.error("Erro no fallback de documentos:", fallbackError);
                    return { data: null, error: fallbackError };
                }
            }
        },
        async add(docData, file) {
            try {
                const user = auth.currentUser || currentUser;
                docData.user_id = user.uid;
                const fileExt = file.name ? file.name.split('.').pop() : (file.type === 'application/pdf' ? 'pdf' : 'jpg');
                const fileName = `${user.uid}/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${fileExt}`;
                
                const ref = storage.ref().child(`motrix_docs/${fileName}`);
                await ref.put(file);
                const publicUrl = await ref.getDownloadURL();
                
                docData.file_url = publicUrl;
                docData.created_at = new Date().toISOString();
                
                const docRef = await fbDb.collection('documents').add(docData);
                docData.id = docRef.id;
                
                return { data: [docData], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async delete(id, fileUrl) {
            try {
                await fbDb.collection('documents').doc(id).delete();
                try {
                    const storageRef = firebase.storage().refFromURL(fileUrl);
                    await storageRef.delete();
                } catch(e) { console.error("Erro ao excluir do storage", e); }
                return { error: null };
            } catch (error) { return { error }; }
        }
    },
    jornadas: {
        async getAll() {
            try {
                const user = auth.currentUser || currentUser;
                if(!user) return {data: [], error: null};
                const snapshot = await fbDb.collection('jornadas')
                    .where('user_id', '==', user.uid)
                    .orderBy('created_at', 'desc').get();
                return { data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null };
            } catch (error) { 
                console.warn("Erro ao buscar jornadas com ordenação:", error);
                try {
                    const user = auth.currentUser || currentUser;
                    const snapshot = await fbDb.collection('jornadas').where('user_id', '==', user.uid).get();
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
                    return { data, error: null };
                } catch (fallbackError) {
                    console.error("Erro no fallback de jornadas:", fallbackError);
                    return { data: null, error: fallbackError };
                }
            }
        },
        async add(jornada) {
            try {
                const user = auth.currentUser || currentUser;
                jornada.user_id = user.uid;
                jornada.created_at = new Date().toISOString();
                const docRef = await fbDb.collection('jornadas').add(jornada);
                jornada.id = docRef.id;
                return { data: [jornada], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async update(id, jornada) {
            try {
                await fbDb.collection('jornadas').doc(id).update(jornada);
                jornada.id = id;
                return { data: [jornada], error: null };
            } catch (error) { return { data: null, error }; }
        },
        async delete(id) {
            try {
                await fbDb.collection('jornadas').doc(id).delete();
                return { error: null };
            } catch (error) { return { error }; }
        }
    },
    profile: {
        async get() {
            try {
                const user = auth.currentUser || currentUser;
                if (!user) return { data: null, error: null };
                const doc = await fbDb.collection('profiles').doc(user.uid).get();
                if (doc.exists) {
                    return { data: doc.data(), error: null };
                } else {
                    const newProfile = {
                        user_id: user.uid,
                        email: user.email,
                        name: user.displayName || "",
                        phone: "",
                        is_premium: false,
                        current_period_end: null
                    };
                    await fbDb.collection('profiles').doc(user.uid).set(newProfile);
                    return { data: newProfile, error: null };
                }
            } catch (error) {
                console.error("Erro no profile.get:", error);
                return { data: null, error };
            }
        },
        async update(profileData) {
            try {
                const user = auth.currentUser || currentUser;
                if (!user) return { error: new Error("Usuário não autenticado.") };
                await fbDb.collection('profiles').doc(user.uid).update(profileData);
                return { error: null };
            } catch (error) {
                return { error };
            }
        }
    },
    payments: {
        async getAll() {
            try {
                const user = auth.currentUser || currentUser;
                if (!user) return { data: [], error: null };
                const snapshot = await fbDb.collection('payments')
                    .where('user_id', '==', user.uid)
                    .orderBy('created_at', 'desc').get();
                return { data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null };
            } catch (error) {
                console.warn("Erro ao buscar histórico de pagamentos:", error);
                try {
                    const user = auth.currentUser || currentUser;
                    if (!user) return { data: [], error: null };
                    const snapshot = await fbDb.collection('payments').where('user_id', '==', user.uid).get();
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
                    return { data, error: null };
                } catch (fallbackError) {
                    console.error("Erro no fallback de pagamentos:", fallbackError);
                    return { data: null, error: fallbackError };
                }
            }
        }
    }
};
