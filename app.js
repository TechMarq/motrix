/**
 * MOTRIX - CORE LOGIC
 */

// STATE
let state = {
    vehicles: [], // Array of { id, model, plate, year, km_actual, renavam, etc. }
    activeVehicleId: null,
    isPremium: false,
    fuelLogs: [],
    maintenanceLogs: [],
    billingLogs: [],
    documents: [],
    costsLogs: [],
    currentView: 'dashboard',
    historyTab: 'fuel',
    editingFuelId: null,
    editingMaintId: null,
    jornadas: [],
    activeJornada: null
};

let charts = {}; // Store Chart.js instances

// INITIALIZE
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Tenta recuperar sessão ativa no Firebase
        const user = await window.db.auth.getUser();
        
        if (!user) {
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('app').style.display = 'none';
            lucide.createIcons();
            return;
        }

        // 2. Block access if email not verified
        if (!user.emailVerified) {
            await firebase.auth().signOut();
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('app').style.display = 'none';
            lucide.createIcons();
            return;
        }
        
        currentUser = user; // Salva o usuário global
        window.currentUser = user;
        initializeApp();
    } catch (e) {
        alert("Erro no DOMContentLoaded: " + e.message + "\n" + e.stack);
    }
});

// Auth functions (toggleAuthMode, handleAuth, forgotPassword) are defined in
// the inline <script> in index.html where they also handle Firebase email verification.

async function initializeApp() {
    try {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';

        if (currentUser && currentUser.email) {
            const emailEl = document.getElementById('auth-email-display');
            if (emailEl) emailEl.innerText = currentUser.email;
        }

        loadState(); // Offline data (if any)
        
        // FETCH REALCLOUD PROFILE
        const { data: cloudProfile } = await window.db.profile.get();
        if (cloudProfile) {
            const now = new Date();
            const periodEnd = cloudProfile.current_period_end ? new Date(cloudProfile.current_period_end) : null;
            state.isPremium = !!(periodEnd && periodEnd > now);
        }
        const { data: cloudVehicles, error } = await window.db.vehicles.getAll();
        if (!error && cloudVehicles) {
            state.vehicles = cloudVehicles;
            // Map any old 'initialKm' fields to initial_km to keep front-end compatibility
            state.vehicles.forEach(v => {
                if (v.initial_km !== undefined) v.initialKm = v.initial_km;
            });
            
            // Verifica e seleciona um ID ativo válido
            if (state.vehicles.length > 0 && (!state.activeVehicleId || !state.vehicles.find(v => v.id === state.activeVehicleId))) {
                state.activeVehicleId = state.vehicles[0].id;
            } else if (state.vehicles.length === 0) {
                state.activeVehicleId = null;
            }
        }

        // FETCH REALCLOUD FUEL & MAINTENANCE
        const { data: cloudFuel } = await window.db.fuel.getAll();
        if (cloudFuel) {
            state.fuelLogs = cloudFuel.map(f => ({
                ...f,
                vehicleId: f.vehicle_id
            }));
        }

        const { data: cloudMaint } = await window.db.maintenance.getAll();
        if (cloudMaint) {
            state.maintenanceLogs = cloudMaint.map(m => ({
                ...m,
                vehicleId: m.vehicle_id,
                intervalType: m.interval_type,
                intervalVal: m.interval_val,
                next: m.next_km,
                nextDate: m.next_date,
                status: m.status || 'pendente'
            }));
        }
        
        const { data: cloudCosts } = await window.db.costs.getAll();
        if (cloudCosts) {
            state.costsLogs = cloudCosts.map(c => ({
                ...c,
                vehicleId: c.vehicle_id,
                desc: c.description
            }));
        }

        const { data: cloudBilling } = await window.db.billing.getAll();
        if (cloudBilling) {
            state.billingLogs = cloudBilling.map(b => ({
                ...b,
                vehicleId: b.vehicle_id
            }));
        }

        const { data: cloudDocs } = await window.db.documents.getAll();
        if (cloudDocs) {
            state.documents = cloudDocs.map(d => ({
                ...d,
                vehicleId: d.vehicle_id,
                data: d.file_url 
            }));
        }

        const { data: cloudJornadas } = await window.db.jornadas.getAll();
        if (cloudJornadas) {
            state.jornadas = cloudJornadas;
            state.activeJornada = state.jornadas.find(j => j.status === 'active') || null;
            updateJornadasUI();
        }

        lucide.createIcons();
        recalculateConsumptions();
        switchView(state.currentView || 'dashboard');
        
        // Set default dates for forms
        const today = new Date().toISOString().split('T')[0];
        if (document.getElementById('fuel-date')) {
            document.getElementById('fuel-date').value = today;
        }
        if (document.getElementById('maint-date')) {
            document.getElementById('maint-date').value = today;
        }
        if (document.getElementById('bill-date')) {
            document.getElementById('bill-date').value = today;
        }

        if (state.vehicles.length === 0) {
            const modal = document.getElementById('modal-vehicle');
            modal.classList.add('active');
            modal.style.display = 'block';
        }
    } catch (e) {
        alert("Erro no initializeApp: " + e.message + "\n" + e.stack);
    }
}

// LOAD/SAVE STATE
function loadState() {
    const saved = localStorage.getItem('motrix_state');
    if (saved) {
        const loaded = JSON.parse(saved);
        state = { ...state, ...loaded };
        
        // MIGRATION: Old single vehicle to new array
        if (loaded.vehicle && (!loaded.vehicles || loaded.vehicles.length === 0)) {
            const vId = Date.now();
            const migVeh = { 
                id: vId,
                model: loaded.vehicle.model,
                plate: loaded.vehicle.plate,
                year: loaded.vehicle.year,
                km_actual: loaded.vehicle.km_actual,
                renavam: '',
                chassi: '',
                color: '',
                motor: '',
                obs: ''
            };
            state.vehicles = [migVeh];
            state.activeVehicleId = vId;
            delete state.vehicle;
            
            // Assign existing logs to this vehicle
            if (state.fuelLogs) state.fuelLogs.forEach(l => l.vehicleId = vId);
            if (state.maintenanceLogs) state.maintenanceLogs.forEach(l => l.vehicleId = vId);
            if (state.costsLogs) state.costsLogs.forEach(l => l.vehicleId = vId);
            if (state.documents) state.documents.forEach(doc => doc.vehicleId = vId);
            
            saveState();
        }

        if (state.vehicles.length > 0 && !state.activeVehicleId) {
            state.activeVehicleId = state.vehicles[0].id;
        }

        // PERMANENT ORPHAN CLEANUP
        const firstVehId = state.activeVehicleId;
        if (firstVehId) {
            const assignOrphan = (list) => {
                if (!list) return;
                list.forEach(l => { if (!l.vehicleId) l.vehicleId = firstVehId; });
            };
            assignOrphan(state.fuelLogs);
            assignOrphan(state.maintenanceLogs);
            assignOrphan(state.billingLogs);
            assignOrphan(state.costsLogs);
            assignOrphan(state.documents);
        }
    }
}

function saveState() {
    localStorage.setItem('motrix_state', JSON.stringify(state));
    refreshUI();
}

function refreshUI() {
    updateDashboardUI();
    if (state.currentView === 'billing') renderBilling();
    if (state.currentView === 'costs') renderCosts();
    if (state.currentView === 'analytics') renderAnalytics();
    if (state.currentView === 'wallet') renderWallet();
    if (state.currentView === 'history') renderFullHistory();
    if (state.currentView === 'jornadas') updateJornadasUI();
}

// VIEW MANAGEMENT
function switchView(viewId) {
    state.currentView = viewId;
    
    // 1. Close open modals/overlays
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.classList.remove('active');
        m.classList.remove('flex-active');
    });

    // 2. Manage View Sections
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');

    // 3. Highlight Bottom Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const text = item.querySelector('span')?.innerText.toLowerCase();
        const mapping = {
            'dashboard': 'início',
            'jornadas': 'jornadas',
            'billing': 'ganhos',
            'fleet': 'frota',
            'costs': 'custos',
            'analytics': 'análise',
            'wallet': 'documentos'
        };
        if (text === mapping[viewId]) item.classList.add('active');
    });

    // 4. Onboarding check
    if (!state.activeVehicleId && viewId === 'dashboard') {
        toggleVehicleModal();
    }

    // 5. Trigger Rendering per context
    if (viewId === 'dashboard') updateDashboardUI();
    if (viewId === 'history') renderFullHistory();
    if (viewId === 'wallet') renderWallet();
    if (viewId === 'costs') renderCosts();
    if (viewId === 'billing') renderBilling();
    if (viewId === 'analytics') renderAnalytics();
    if (viewId === 'jornadas') updateJornadasUI();
    
    if (viewId === 'costs-form') {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('cost-date').value = today;
        // Show jornada tag if a shift is active
        const jornadaTag = document.getElementById('cost-jornada-tag');
        if (jornadaTag) jornadaTag.style.display = state.activeJornada ? 'block' : 'none';
        // Reset platform chip selection
        document.querySelectorAll('#cost-platform-selector .btn-chip-sm').forEach(c => c.classList.remove('active'));
        const noneChip = document.querySelector('#cost-platform-selector .btn-chip-sm[data-plat=""]');
        if (noneChip) noneChip.classList.add('active');
        document.getElementById('cost-platform-value').value = '';
    }
    if (viewId === 'billing-form') {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('bill-date').value = today;
        // Show jornada tag if a shift is active
        const billTag = document.getElementById('billing-jornada-tag');
        if (billTag) billTag.style.display = state.activeJornada ? 'block' : 'none';
    }
}

function toggleVehicleModal() {
    const modal = document.getElementById('modal-vehicle');
    if (!modal) return;
    
    const isVisible = modal.style.display === 'block' || modal.classList.contains('active');
    
    if (!isVisible) {
        modal.style.display = 'block';
        modal.classList.add('active');
        showVehicleList(); // Always start at the list screen
    } else {
        if (state.vehicles.length === 0) {
            alert("Por favor, adicione um veículo para continuar.");
            return;
        }
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

// FORM SUBMISSIONS
document.getElementById('form-vehicle').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('veh-id').value; // is a UUID now (or string)
    
    const btn = document.querySelector('#form-vehicle button[type="submit"]');
    const oriText = btn.innerText;
    btn.innerText = "Salvando na Nuvem...";
    btn.disabled = true;

    // Database schema uses initial_km instead of initialKm. Let's send both or map it correctly:
    const vData = {
        model: document.getElementById('veh-model').value,
        plate: document.getElementById('veh-plate').value.toUpperCase(),
        renavam: document.getElementById('veh-renavam').value,
        chassi: document.getElementById('veh-chassi').value.toUpperCase(),
        color: document.getElementById('veh-color').value,
        motor: document.getElementById('veh-motor').value,
        year: parseInt(document.getElementById('veh-year').value) || 0,
        initial_km: parseInt(document.getElementById('veh-km').value) || 0,
        km_actual: parseInt(document.getElementById('veh-km').value) || 0,
        obs: document.getElementById('veh-obs').value
    };

    if (id) {
        // Update
        const { data, error } = await window.db.vehicles.update(id, vData);
        if (error) {
            alert("Erro ao atualizar veículo: " + error.message);
        } else if (data && data.length > 0) {
            const idx = state.vehicles.findIndex(v => v.id === id);
            const savedVeh = data[0];
            savedVeh.initialKm = savedVeh.initial_km; // local compatible map
            if (idx !== -1) state.vehicles[idx] = savedVeh;
        }
    } else {
        // New
        const { data, error } = await window.db.vehicles.add(vData);
        if (error) {
            alert("Erro ao cadastrar veículo: " + error.message);
        } else if (data && data.length > 0) {
            const savedVeh = data[0];
            savedVeh.initialKm = savedVeh.initial_km;
            state.vehicles.push(savedVeh);
            state.activeVehicleId = savedVeh.id;
        }
    }

    btn.innerText = oriText;
    btn.disabled = false;
    
    saveState(); // backup local state
    showVehicleList();
    updateDashboardUI();
});

document.getElementById('form-fuel').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('fuel-date').value;
    const type = document.getElementById('fuel-type').value;
    const station = document.getElementById('fuel-station').value || 'Não informado';
    const km = parseInt(document.getElementById('fuel-km').value) || 0;
    const liters = parseFloat(document.getElementById('fuel-liters').value) || 0;
    const total = parseFloat(document.getElementById('fuel-total').value) || 0;

    const btn = document.querySelector('#form-fuel button[type="submit"]');
    const oriText = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    if (state.editingFuelId) {
        // UPDATE EXISTING LOG
        const updateData = {
            date: date + 'T12:00:00Z',
            type: type,
            station: station,
            km: km,
            liters: liters,
            total: total
        };

        const { data, error } = await window.db.fuel.update(state.editingFuelId, updateData);
        if (error) {
            alert("Erro ao editar abastecimento: " + error.message);
        } else {
            const index = state.fuelLogs.findIndex(l => l.id === state.editingFuelId);
            if (index !== -1 && data && data.length > 0) {
                const updated = data[0];
                updated.vehicleId = updated.vehicle_id;
                state.fuelLogs[index] = updated;
                recalculateConsumptions();
            }
        }

        state.editingFuelId = null;
        btn.innerText = 'Registrar';
        document.getElementById('btn-cancel-fuel').style.display = 'none';
    } else {
        // CREATE NEW LOG
        const newLog = {
            vehicle_id: state.activeVehicleId,
            date: date + 'T12:00:00Z',
            type: type,
            station: station,
            km: km,
            liters: liters,
            total: total,
            consumption: 0 // Will be calculated by recalculateConsumptions()
        };
        if (state.activeJornada) {
            newLog.jornada_id = state.activeJornada.id;
        }

        const { data, error } = await window.db.fuel.add(newLog);
        if (error) {
            alert("Erro ao salvar abastecimento: " + error.message);
        } else if (data && data.length > 0) {
            const savedLog = data[0];
            savedLog.vehicleId = savedLog.vehicle_id;
            state.fuelLogs.unshift(savedLog);
            recalculateConsumptions();
        }
    }

    // Update vehicle KM with the highest value found in logs for the active vehicle
    const activeVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    if (activeVehicle) {
        const vehicleFuelLogs = state.fuelLogs.filter(l => l.vehicleId === state.activeVehicleId);
        if (vehicleFuelLogs.length > 0) {
            const maxKmLog = Math.max(...vehicleFuelLogs.map(l => l.km));
            if (maxKmLog > (activeVehicle.km_actual || 0)) {
                activeVehicle.km_actual = maxKmLog;
                await window.db.vehicles.update(activeVehicle.id, { km_actual: maxKmLog });
            }
        } else {
            if (km > (activeVehicle.km_actual || 0)) {
                activeVehicle.km_actual = km;
                await window.db.vehicles.update(activeVehicle.id, { km_actual: km });
            }
        }
    }
    
    btn.innerText = oriText;
    btn.disabled = false;

    saveState();
    e.target.reset();
    document.getElementById('fuel-date').value = new Date().toISOString().split('T')[0];
    renderFuelHistory();
    switchView('fuel');
});

function recalculateConsumptions() {
    // Filter logs for the active vehicle
    const vehicleFuelLogs = state.fuelLogs.filter(l => l.vehicleId === state.activeVehicleId);
    // Sort logs by KM descending to calculate accurately
    const sorted = [...vehicleFuelLogs].sort((a, b) => b.km - a.km);
    for (let i = 0; i < sorted.length; i++) {
        if (i < sorted.length - 1) {
            const nextLog = sorted[i+1];
            const kmDriven = sorted[i].km - nextLog.km;
            sorted[i].consumption = (kmDriven > 0 && sorted[i].liters > 0) ? kmDriven / sorted[i].liters : 0;
        } else {
            sorted[i].consumption = 0; // First log (oldest KM) has no consumption
        }
    }
    // Update only the active vehicle's logs in the main state
    state.fuelLogs = state.fuelLogs.filter(l => l.vehicleId !== state.activeVehicleId).concat(sorted);
}

function editFuelLog(id) {
    const log = state.fuelLogs.find(l => l.id === id && l.vehicleId === state.activeVehicleId); // Filter by vehicleId
    if (!log) return;

    state.editingFuelId = id;
    document.getElementById('fuel-date').value = log.date.split('T')[0];
    document.getElementById('fuel-type').value = log.type;
    document.getElementById('fuel-station').value = log.station === 'Não informado' ? '' : log.station;
    document.getElementById('fuel-km').value = log.km;
    document.getElementById('fuel-liters').value = log.liters;
    document.getElementById('fuel-total').value = log.total;

    document.querySelector('#form-fuel button[type="submit"]').innerText = 'Salvar Alterações';
    document.getElementById('btn-cancel-fuel').style.display = 'inline-block';
    
    // Smooth scroll to form
    document.querySelector('#view-fuel').scrollIntoView({ behavior: 'smooth' });
}

function cancelFuelEdit() {
    state.editingFuelId = null;
    document.getElementById('form-fuel').reset();
    document.getElementById('fuel-date').value = new Date().toISOString().split('T')[0];
    document.querySelector('#form-fuel button[type="submit"]').innerText = 'Registrar';
    document.getElementById('btn-cancel-fuel').style.display = 'none';
}

async function deleteFuelLog(id) {
    if (confirm('Tem certeza que deseja excluir este abastecimento da base de dados?')) {
        const { error } = await window.db.fuel.delete(id);
        if (error) {
            alert("Erro ao excluir abastecimento: " + error.message);
            return;
        }
        state.fuelLogs = state.fuelLogs.filter(l => l.id !== id || l.vehicleId !== state.activeVehicleId); 
        recalculateConsumptions();
        saveState();
        renderFuelHistory();
    }
}

function calculateNextMaint() {
    const km = parseInt(document.getElementById('maint-km').value) || 0;
    const interval = parseInt(document.getElementById('maint-interval-val').value) || 0;
    const intervalType = document.getElementById('maint-interval-type').value;

    if (intervalType === 'km') {
        document.getElementById('maint-next').value = km + interval;
    }
}

function toggleMaintIntervalFields() {
    const type = document.getElementById('maint-interval-type').value;
    document.getElementById('maint-fields-km').style.display = type === 'km' ? 'grid' : 'none';
    document.getElementById('maint-fields-date').style.display = type === 'date' ? 'block' : 'none';
    calculateNextMaint();
}

document.getElementById('form-maintenance').addEventListener('submit', async (e) => {
    e.preventDefault();
    const serviceDate = document.getElementById('maint-date').value;
    const station = document.getElementById('maint-station').value || 'Não informado';
    const type = document.getElementById('maint-type').value;
    const km = parseInt(document.getElementById('maint-km').value) || 0;
    const cost = parseFloat(document.getElementById('maint-cost').value || 0);
    const obs = document.getElementById('maint-obs').value || '';
    const intervalType = document.getElementById('maint-interval-type').value;
    
    let nextKM = null;
    let nextDate = null;
    let intervalVal = null;

    if (intervalType === 'km') {
        const intervalInput = document.getElementById('maint-interval-val');
        intervalVal = parseInt(intervalInput.value);
        nextKM = km + intervalVal;
    } else if (intervalType === 'date') {
        nextDate = document.getElementById('maint-next-date').value;
    }

    const btn = document.querySelector('#form-maintenance button[type="submit"]');
    const oriText = btn.innerText;
    btn.innerText = "Salvando na Nuvem...";
    btn.disabled = true;

    const logData = {
        date: serviceDate + 'T12:00:00Z',
        type: type,
        station: station,
        km: km,
        cost: cost,
        obs: obs,
        interval_type: intervalType,
        interval_val: intervalVal,
        next_km: nextKM,
        next_date: nextDate
    };

    if (state.editingMaintId) {
        // UPDATE EXISTING
        const { data, error } = await window.db.maintenance.update(state.editingMaintId, logData);
        if (error) {
            alert("Erro ao editar manutenção: " + error.message);
        } else {
            const idx = state.maintenanceLogs.findIndex(m => m.id === state.editingMaintId && m.vehicleId === state.activeVehicleId);
            if (idx !== -1 && data && data.length > 0) {
                const updatedMaint = data[0];
                state.maintenanceLogs[idx] = {
                    ...updatedMaint,
                    vehicleId: updatedMaint.vehicle_id,
                    intervalType: updatedMaint.interval_type,
                    intervalVal: updatedMaint.interval_val,
                    next: updatedMaint.next_km,
                    nextDate: updatedMaint.next_date,
                    status: updatedMaint.status || state.maintenanceLogs[idx].status || 'pendente'
                };
            }
        }
        state.editingMaintId = null;
        btn.innerText = 'Registrar Manutenção';
        document.getElementById('btn-cancel-maint').style.display = 'none';
    } else {
        // CREATE NEW
        logData.vehicle_id = state.activeVehicleId;
        logData.status = 'pendente';
        if (state.activeJornada) {
            logData.jornada_id = state.activeJornada.id;
        }
        const { data, error } = await window.db.maintenance.add(logData);
        
        if (error) {
            alert("Erro ao gravar manutenção: " + error.message);
        } else if (data && data.length > 0) {
            const newMaint = data[0];
            state.maintenanceLogs.unshift({
                ...newMaint,
                vehicleId: newMaint.vehicle_id,
                intervalType: newMaint.interval_type,
                intervalVal: newMaint.interval_val,
                next: newMaint.next_km,
                nextDate: newMaint.next_date,
                status: newMaint.status || 'pendente'
            });
        }
    }

    // Update vehicle KM with the highest value found in logs for the active vehicle
    const activeVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    if (activeVehicle) {
        const vehicleMaintLogs = state.maintenanceLogs.filter(l => l.vehicleId === state.activeVehicleId);
        if (vehicleMaintLogs.length > 0) {
            const maxKmLog = Math.max(...vehicleMaintLogs.map(l => l.km));
            if (maxKmLog > (activeVehicle.km_actual || 0)) {
                activeVehicle.km_actual = maxKmLog;
                await window.db.vehicles.update(activeVehicle.id, { km_actual: maxKmLog });
            }
        } else {
            if (km > (activeVehicle.km_actual || 0)) {
                activeVehicle.km_actual = km;
                await window.db.vehicles.update(activeVehicle.id, { km_actual: km });
            }
        }
    }

    btn.innerText = oriText;
    btn.disabled = false;

    saveState();
    e.target.reset();
    document.getElementById('maint-date').value = new Date().toISOString().split('T')[0];
    toggleMaintIntervalFields();
    renderMaintenanceHistory();
    switchView('maintenance');
});

function editMaintenance(id) {
    const m = state.maintenanceLogs.find(log => log.id === id);
    if (!m) return;

    state.editingMaintId = id;
    document.getElementById('maint-date').value = (m.date || '').split('T')[0];
    document.getElementById('maint-station').value = m.station || '';
    document.getElementById('maint-type').value = m.type || '';
    document.getElementById('maint-km').value = m.km || 0;
    document.getElementById('maint-cost').value = m.cost || 0;
    document.getElementById('maint-obs').value = m.obs || '';
    document.getElementById('maint-interval-type').value = m.intervalType || 'none';
    
    if (m.intervalType === 'km') {
        document.getElementById('maint-interval-val').value = m.intervalVal || 10000;
        document.getElementById('maint-next').value = m.next || 0;
    } else if (m.intervalType === 'date') {
        document.getElementById('maint-next-date').value = m.nextDate || '';
    }

    document.querySelector('#form-maintenance button[type="submit"]').innerText = 'Salvar Alterações';
    document.getElementById('btn-cancel-maint').style.display = 'inline-block';
    toggleMaintIntervalFields();
    
    document.querySelector('#view-maintenance').scrollIntoView({ behavior: 'smooth' });
}

function cancelMaintenanceEdit() {
    state.editingMaintId = null;
    document.getElementById('form-maintenance').reset();
    document.getElementById('maint-date').value = new Date().toISOString().split('T')[0];
    document.querySelector('#form-maintenance button[type="submit"]').innerText = 'Registrar Manutenção';
    document.getElementById('btn-cancel-maint').style.display = 'none';
    toggleMaintIntervalFields();
}

async function deleteMaintenance(id) {
    if (confirm('Tem certeza que deseja excluir este registro de manutenção da base de dados?')) {
        const { error } = await window.db.maintenance.delete(id);
        if (error) {
            alert("Erro ao excluir manutenção: " + error.message);
            return;
        }
        state.maintenanceLogs = state.maintenanceLogs.filter(m => m.id !== id);
        saveState();
        renderMaintenanceHistory();
    }
}

async function toggleMaintStatus(id) {
    const m = state.maintenanceLogs.find(log => log.id === id);
    if (!m) return;
    
    const newStatus = m.status === 'concluido' ? 'pendente' : 'concluido';
    
    try {
        const { error } = await window.db.maintenance.update(id, { status: newStatus });
        if (error) throw error;
        m.status = newStatus;
        saveState();
        renderFullHistory();
        renderMaintenanceHistory();
    } catch (e) {
        alert("Erro ao atualizar status: " + e.message);
    }
}

function renderMaintenanceHistory() {
    const list = document.getElementById('maintenance-history');
    if (!list) return;
    
    list.innerHTML = '<h3 class="text-caption" style="margin-bottom: 12px; text-transform: uppercase; font-weight: 700;">Últimas Manutenções</h3>';
    
    state.maintenanceLogs
        .filter(m => m.vehicleId === state.activeVehicleId || !m.vehicleId)
        .slice(0, 10).forEach(m => {
        const dateRaw = m.date.split('T')[0];
        const [y, m_d, d] = dateRaw.split('-');
        const formattedDate = `${d}/${m_d}/${y}`;
        
        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.marginBottom = '12px';
        div.style.padding = '12px';
        
        let nextInfo = '';
        if (m.intervalType === 'km') nextInfo = `Próxima: ${m.next.toLocaleString()} KM`;
        else if (m.intervalType === 'date') {
            const [ny, nm, nd] = m.nextDate.split('-');
            nextInfo = `Próxima: ${nd}/${nm}/${ny}`;
        }

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 15px;">${m.type}</strong>
                    <span class="text-caption" style="display: block; margin-top: 2px;">
                        <i data-lucide="map-pin" style="width: 10px; height: 10px; display: inline-block;"></i> ${m.station || 'Local não informado'}
                    </span>
                    <span class="text-caption" style="display: block;">${formattedDate} • ${m.km.toLocaleString()} KM</span>
                    ${m.obs ? `<p class="text-caption" style="font-style: italic; margin-top: 4px;">Obs: ${m.obs}</p>` : ''}
                    <span class="text-caution" style="display: block; color: var(--accent-orange); font-size: 12px; font-weight: 600; margin-top: 4px;">${nextInfo}</span>
                </div>
                <div style="text-align: right;">
                    <div class="badge-alert" onclick="toggleMaintStatus('${m.id}')" style="margin-bottom: 8px; border: 1px solid ${m.status === 'concluido' ? 'var(--success)' : 'var(--accent-orange)'}; background: transparent; color: ${m.status === 'concluido' ? 'var(--success)' : 'var(--accent-orange)'}; font-size: 10px; padding: 2px 8px; cursor: pointer; display: inline-block;" title="Clique para alterar status">
                        <i data-lucide="${m.status === 'concluido' ? 'check-circle' : 'clock'}" style="width: 10px; margin-right: 4px;"></i>${m.status === 'concluido' ? 'CONCLUÍDO' : 'PENDENTE'}
                    </div>
                    <strong style="display: block;">R$ ${m.cost.toFixed(2)}</strong>
                    <div style="margin-top: 24px; display: flex; gap: 8px; justify-content: flex-end;">
                        <button onclick="editMaintenance('${m.id}')" class="btn-icon" title="Editar">
                            <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button onclick="deleteMaintenance('${m.id}')" class="btn-icon btn-icon-danger" title="Excluir">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
    lucide.createIcons();
}

document.getElementById('form-billing').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('bill-date').value;
    const platform = document.getElementById('bill-platform-value').value;
    const amount = parseFloat(document.getElementById('bill-amount').value);
    const km = parseInt(document.getElementById('bill-km').value || 0);

    const newBill = {
        date: date + 'T12:00:00Z',
        vehicle_id: state.activeVehicleId,
        platform,
        amount,
        km
    };
    if (state.activeJornada) {
        newBill.jornada_id = state.activeJornada.id;
    }

    const { data, error } = await window.db.billing.add(newBill);
    if (error) {
        alert("Erro ao gravar faturamento: " + error.message);
    } else if (data && data.length > 0) {
        const savedBill = data[0];
        savedBill.vehicleId = savedBill.vehicle_id;
        state.billingLogs.unshift(savedBill);
    }

    saveState();
    e.target.reset();
    document.getElementById('bill-date').value = new Date().toISOString().split('T')[0];
    switchView('billing');
});

// Billing Platform Chip Selector
const billPlatformChips = document.querySelectorAll('#bill-platform-selector .btn-chip-blue');
billPlatformChips.forEach(chip => {
    chip.addEventListener('click', () => {
        billPlatformChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('bill-platform-value').value = chip.dataset.type;
    });
});


function renderBilling() {
    const list = document.getElementById('billing-list');
    const summary = document.getElementById('billing-summary-by-platform');
    const totalEl = document.getElementById('stat-billing-total');
    if (!list || !summary || !totalEl) return;

    list.innerHTML = '';
    summary.innerHTML = '';

    // Financial Summary Logic
    let total = 0;
    const byPlatform = {};

    state.billingLogs.filter(b => b.vehicleId === state.activeVehicleId || !b.vehicleId).forEach(b => {
        total += b.amount;
        byPlatform[b.platform] = (byPlatform[b.platform] || 0) + b.amount;
    });

    totalEl.innerText = `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    // Summary by Platform
    for (const [plat, val] of Object.entries(byPlatform)) {
        let icon = 'banknote';
        if (plat === 'Uber') icon = 'navigation';
        if (plat === '99') icon = 'navigation-2';

        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '12px 16px';
        div.style.marginBottom = '8px';
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <i data-lucide="${icon}" style="width: 18px; height: 18px; color: #00f2ff;"></i>
                <strong>${plat}</strong>
            </div>
            <strong>R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
        `;
        summary.appendChild(div);
    }

    // List Gains
    state.billingLogs
        .filter(b => b.vehicleId === state.activeVehicleId || !b.vehicleId)
        .sort((a,b) => new Date(b.date) - new Date(a.date))
        .forEach(b => {
        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.borderLeft = '4px solid #00f2ff';
        div.style.marginBottom = '12px';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h4 style="margin-bottom: 4px;">${b.platform}</h4>
                    <span class="text-caption">${b.km > 0 ? b.km + ' KM rodados' : 'KM não informado'}</span><br>
                    <span class="text-caption" style="font-size: 11px; opacity: 0.7;">${new Date(b.date).toLocaleDateString('pt-BR')}</span>
                </div>
                <div style="text-align: right;">
                    <strong style="color: var(--success);">R$ ${b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    <div style="margin-top: 10px;">
                        <button onclick="deleteBilling('${b.id}')" class="text-caption" style="color: var(--danger); border: none; background: none; font-weight: 600; cursor: pointer;">Deletar</button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(div);
    });

    lucide.createIcons();
}

async function deleteBilling(id) {
    if (confirm('Excluir este faturamento da nuvem?')) {
        const { error } = await window.db.billing.delete(id);
        if (error) {
            alert("Erro ao excluir: " + error.message);
            return;
        }
        state.billingLogs = state.billingLogs.filter(b => b.id !== id);
        saveState();
        renderBilling();
        renderBillingHistory();
    }
}

function renderBillingHistory() {
    const list = document.getElementById('billing-history');
    if (!list) return;
    
    list.innerHTML = '<h3 class="text-caption" style="margin-bottom: 12px; text-transform: uppercase; font-weight: 700;">Ganhos Recentes</h3>';
    
    state.billingLogs
        .filter(b => b.vehicleId === state.activeVehicleId || !b.vehicleId)
        .slice(0, 10).forEach(b => {
        const dateRaw = b.date.split('T')[0];
        const [y, m, d] = dateRaw.split('-');
        
        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.marginBottom = '10px';
        div.style.padding = '12px';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${b.platform}</strong>
                    <span class="text-caption" style="display: block;">${d}/${m}/${y} ${b.km > 0 ? `• ${b.km} KM` : ''}</span>
                </div>
                <div style="text-align: right; display: flex; align-items: center; gap: 12px;">
                    <strong style="color: var(--success); font-size: 16px;">R$ ${b.amount.toFixed(2)}</strong>
                    <button onclick="deleteBilling('${b.id}')" class="btn-icon btn-icon-danger">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
    lucide.createIcons();
}

// UI UPDATES
function updateDashboardUI() {
    try {
        const activeVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
        if (!activeVehicle) return;

        const updateText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        // Header info
        updateText('stat-veh-model', `${activeVehicle.model} • ${activeVehicle.plate}`);
        
        // VIP Badge (Toggleable for testing)
        const badge = document.getElementById('premium-badge');
        if (badge) {
            badge.style.display = 'block'; // Always visible to allow TESTER to toggle
            badge.innerText = state.isPremium ? 'VIP' : 'TESTAR VIP';
            badge.style.background = state.isPremium ? 'linear-gradient(135deg, #ffd700, #ff8c00)' : 'rgba(255,140,0,0.1)';
            badge.style.color = state.isPremium ? 'black' : 'var(--accent-orange)';
        }
        // Calculate "Real" current KM based on logs (highest value wins)
        const vehicleFuelLogsForKM = (state.fuelLogs || []).filter(l => l.vehicleId === state.activeVehicleId);
        const vehicleMaintLogsForKM = (state.maintenanceLogs || []).filter(l => l.vehicleId === state.activeVehicleId);
        
        let maxKM = activeVehicle.km_actual || 0;
        if (vehicleFuelLogsForKM.length > 0) {
            maxKM = Math.max(maxKM, ...vehicleFuelLogsForKM.map(l => l.km || 0));
        }
        if (vehicleMaintLogsForKM.length > 0) {
            maxKM = Math.max(maxKM, ...vehicleMaintLogsForKM.map(m => m.km || 0));
        }
        
        // Sync back to state object for other logic (like alerts)
        activeVehicle.km_actual = maxKM;

        // KM Actual UI Update
        updateText('stat-km-actual', maxKM.toLocaleString('pt-BR'));

        // Monthly Date Helper
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Logs Filtering by Active Vehicle (STRICT)
        const filterThisMonth = (log) => {
            if (!log.date || log.vehicleId !== state.activeVehicleId) return false;
            const d = new Date(log.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        };

        const fuelMonthLogs = (state.fuelLogs || []).filter(filterThisMonth);
        const maintMonthLogs = (state.maintenanceLogs || []).filter(filterThisMonth);
        const costsMonthLogs = (state.costsLogs || []).filter(filterThisMonth);

        // Billing is filtered by vehicle
        const billingMonthLogs = (state.billingLogs || []).filter(l => {
            if (l.vehicleId !== state.activeVehicleId) return false;
            const d = new Date(l.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        // FINANCIAL TOTALS
        const totalFuelMonth = fuelMonthLogs.reduce((acc, log) => acc + (log.total || 0), 0);
        const totalMaintMonth = maintMonthLogs.reduce((acc, log) => acc + (log.cost || 0), 0);
        // Note: General costsMonthLogs are stored but not included in this dashboard total as requested
        
        const totalSpentMonth = totalFuelMonth + totalMaintMonth;
        const totalRevenueMonth = billingMonthLogs.reduce((acc, log) => acc + (log.amount || 0), 0);

        // Update Dashboard UI Labels
        updateText('stat-total-fuel-month', `R$ ${totalFuelMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        updateText('stat-total-maint-month', `R$ ${totalMaintMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        updateText('stat-total-spent-month', `R$ ${totalSpentMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        updateText('stat-revenue-month', `R$ ${totalRevenueMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        
        // Distribution
        updateText('dist-fuel-val', `R$ ${totalFuelMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        updateText('dist-maint-val', `R$ ${totalMaintMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

        // Spent breakdown
        let fuelPerc = 0;
        let maintPerc = 0;
        if (totalSpentMonth > 0) {
            fuelPerc = (totalFuelMonth / totalSpentMonth) * 100;
            maintPerc = (totalMaintMonth / totalSpentMonth) * 100;
        }
        
        const progressBar = document.getElementById('cost-progress-bar');
        if (progressBar) progressBar.style.width = `${fuelPerc}%`;
        
        updateText('stat-spent-breakdown', `Combustível: ${fuelPerc.toFixed(0)}% | Manutenção: ${maintPerc.toFixed(0)}%`);

        // NEW: Net Profit Logic
        const netProfitMonth = totalRevenueMonth - totalSpentMonth;
        updateText('stat-profit-month', `R$ ${netProfitMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        
        const profitCard = document.getElementById('stat-profit-month')?.parentElement?.parentElement;
        if (profitCard) {
            if (netProfitMonth < 0) {
                profitCard.style.background = 'linear-gradient(135deg, #ff4d4d 0%, #ff8c00 100%)';
            } else {
                profitCard.style.background = 'linear-gradient(135deg, #00ff88 0%, #00d2ff 100%)';
            }
        }

        // NEW: Maintenance Reminders Logic
        const remindersList = document.getElementById('maintenance-reminders-list');
        if (remindersList) {
            const upcomingMaints = (state.maintenanceLogs || [])
                .filter(m => m.vehicleId === state.activeVehicleId && (
                    (m.intervalType === 'km' && m.next > activeVehicle.km_actual) ||
                    (m.intervalType === 'date' && m.nextDate && new Date(m.nextDate) > new Date())
                ))
                .sort((a, b) => {
                    if (a.intervalType === 'km' && b.intervalType === 'km') return a.next - b.next;
                    if (a.intervalType === 'date' && b.intervalType === 'date') return new Date(a.nextDate) - new Date(b.nextDate);
                    return 0;
                })
                .slice(0, 3);

            if (upcomingMaints.length > 0) {
                remindersList.innerHTML = '';
                upcomingMaints.forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'glass-card card-compact';
                    div.style.marginBottom = '0';
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    div.style.alignItems = 'center';
                    div.style.borderLeft = '3px solid var(--warning)';
                    
                    let timeLeft = '';
                    if (m.intervalType === 'km') {
                        const kmDiff = m.next - activeVehicle.km_actual;
                        timeLeft = `${kmDiff.toLocaleString('pt-BR')} KM`;
                    } else {
                        const dateDiff = Math.ceil((new Date(m.nextDate) - new Date()) / (1000 * 60 * 60 * 24));
                        timeLeft = `${dateDiff} dias`;
                    }

                    div.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,184,0,0.1); display: flex; align-items: center; justify-content: center; color: var(--warning);">
                                <i data-lucide="wrench" style="width: 16px; height: 16px;"></i>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-size: 11px; font-weight: 700; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${m.type}</span>
                                <span class="text-caption" style="font-size: 9px;">Vence em: ${m.intervalType === 'km' ? m.next.toLocaleString('pt-BR') + ' KM' : new Date(m.nextDate).toLocaleDateString('pt-BR')}</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 12px; font-weight: 800; color: var(--accent-orange); display: block;">${timeLeft}</span>
                            <span style="font-size: 8px; text-transform: uppercase; opacity: 0.6;">Restantes</span>
                        </div>
                    `;
                    remindersList.appendChild(div);
                });
                lucide.createIcons();
            }
        }


        // Avg Consumption and Cost/KM
        const vehicleFuelLogs = (state.fuelLogs || []).filter(log => log.vehicleId === state.activeVehicleId);
        if (vehicleFuelLogs && vehicleFuelLogs.length > 1) {
            const sortedLogs = [...vehicleFuelLogs].sort((a, b) => a.km - b.km);
            const firstKM = sortedLogs[0].km;
            const lastKM = sortedLogs[sortedLogs.length - 1].km;
            const totalKM = lastKM - firstKM;
            const totalCostAll = vehicleFuelLogs.reduce((acc, log) => acc + log.total, 0);
            const totalLitersExclFirst = sortedLogs.slice(1).reduce((acc, log) => acc + log.liters, 0);
            
            if (totalKM > 0 && totalLitersExclFirst > 0) {
                const avg = totalKM / totalLitersExclFirst;
                updateText('stat-avg-consumption', avg.toFixed(1).replace('.', ','));
                const costPerKm = totalCostAll / totalKM;
                updateText('stat-cost-km', `R$ ${costPerKm.toFixed(2).replace('.', ',')}`);
            } else {
                updateText('stat-avg-consumption', '--');
                updateText('stat-cost-km', 'R$ --');
            }
        } else {
            updateText('stat-avg-consumption', '--');
            updateText('stat-cost-km', 'R$ --');
        }

        // Next Scheduled Maintenance Info Card
        const nextMaintCard = document.getElementById('next-maint-info-card');
        if (nextMaintCard) {
            const futureKmMaints = (state.maintenanceLogs || [])
                .filter(m => m.vehicleId === state.activeVehicleId && m.intervalType === 'km' && m.next > activeVehicle.km_actual)
                .sort((a,b) => a.next - b.next);

            if (futureKmMaints.length > 0) {
                const nextTarget = futureKmMaints[0];
                const kmLeft = nextTarget.next - activeVehicle.km_actual;
                nextMaintCard.style.display = 'block';
                updateText('dash-next-maint-type', nextTarget.type);
                updateText('dash-next-maint-km', kmLeft.toLocaleString('pt-BR'));
            } else {
                nextMaintCard.style.display = 'none';
            }
        }

        // Maintenance Alerts
        const alertContainer = document.getElementById('maintenance-alert-container');
        if (alertContainer) {
            const upcoming = (state.maintenanceLogs || []).filter(m => {
                if (m.vehicleId !== state.activeVehicleId || m.intervalType === 'none') return false;
                if (m.intervalType === 'km') {
                    const kmRemaining = m.next - activeVehicle.km_actual;
                    return kmRemaining < 1000;
                } else if (m.intervalType === 'date' && m.nextDate) {
                    const nextDate = new Date(m.nextDate);
                    const today = new Date();
                    const daysDiff = (nextDate - today) / (1000 * 60 * 60 * 24);
                    return daysDiff < 15;
                }
                return false;
            }).sort((a,b) => {
                const a_val = a.intervalType === 'km' ? a.next - activeVehicle.km_actual : 9999;
                const b_val = b.intervalType === 'km' ? b.next - activeVehicle.km_actual : 9999;
                return a_val - b_val;
            });

            if (upcoming.length > 0) {
                alertContainer.style.display = 'block';
                alertContainer.innerHTML = upcoming.slice(0, 3).map(m => {
                    let isVencida = false;
                    let msg = '';
                    let nextInfo = '';
                    if (m.intervalType === 'km') {
                        const kmRemaining = m.next - activeVehicle.km_actual;
                        isVencida = kmRemaining <= 0;
                        msg = isVencida ? `${Math.abs(kmRemaining).toLocaleString('pt-BR')} km atrasada` : `Faltam ${kmRemaining.toLocaleString('pt-BR')} km`;
                        nextInfo = `Próxima em ${m.next.toLocaleString('pt-BR')} km`;
                    } else if (m.intervalType === 'date') {
                        const nd = new Date(m.nextDate);
                        const today = new Date();
                        isVencida = nd <= today;
                        msg = isVencida ? 'Data Vencida' : `${Math.ceil((nd-today)/(1000*60*60*24))} dias restantes`;
                        nextInfo = `Próxima em ${nd.toLocaleDateString('pt-BR')}`;
                    }
                    return `
                        <div class="glass-card" style="border-left: 4px solid ${isVencida ? 'var(--danger)' : 'var(--warning)'}; margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <strong style="display: block; margin-bottom: 4px;">${m.type}</strong>
                                    <span class="text-orange" style="font-weight: 700;">${msg}</span>
                                    <p class="text-caption" style="margin-top: 4px;">${nextInfo}</p>
                                </div>
                                <span class="badge-alert" style="background: ${isVencida ? 'var(--danger)' : 'var(--warning)'}">${isVencida ? 'VENCIDA' : 'PENDENTE'}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                alertContainer.style.display = 'none';
                alertContainer.innerHTML = '';
            }
        }

        // Render mini histories
        renderFuelHistory(); 
        renderMaintenanceHistory();
        renderBillingHistory();
        lucide.createIcons();
    } catch (err) {
        console.error("Erro ao atualizar Dashboard:", err);
    }
}

function renderFuelHistory() {
    const list = document.getElementById('fuel-history');
    if (!list) return;
    
    list.innerHTML = '<h3 class="text-caption" style="margin-bottom: 12px; text-transform: uppercase;">Histórico Recente</h3>';
    
    state.fuelLogs
        .filter(log => log.vehicleId === state.activeVehicleId)
        .sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA - dateB !== 0) return dateB - dateA;
            return b.km - a.km;
        })
        .slice(0, 10).forEach(log => {
        const dateRaw = log.date.split('T')[0];
        const [y, m, d] = dateRaw.split('-');
        const formattedDate = `${d}/${m}/${y}`;
        
        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.marginBottom = '12px';
        div.style.padding = '12px';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 14px;">${formattedDate} • ${log.type || 'N/A'}</strong>
                    <span class="text-caption" style="display: block; margin-bottom: 4px;">${log.station || 'Local não informado'}</span>
                    <span class="text-caption" style="background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${log.km} KM</span>
                </div>
                <div style="text-align: right;">
                    <div style="margin-bottom: 8px;">
                        <strong style="display: block;">R$ ${log.total.toFixed(2)}</strong>
                        <span class="text-caption" style="display: block; color: var(--success); font-weight: 600;">
                            ${log.consumption > 0 ? log.consumption.toFixed(2) + ' km/L' : '--'}
                        </span>
                        <span class="text-caption">${log.liters.toFixed(2)} L</span>
                    </div>
                    <div class="action-buttons" style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button onclick="editFuelLog('${log.id}')" class="btn-icon" title="Editar" style="padding: 4px; border: none; background: rgba(0,242,255,0.1); border-radius: 4px; color: var(--accent); cursor: pointer;">
                            <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button onclick="deleteFuelLog('${log.id}')" class="btn-icon btn-icon-danger" title="Excluir" style="padding: 4px; border: none; background: rgba(255,71,87,0.1); border-radius: 4px; color: var(--danger); cursor: pointer;">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
    lucide.createIcons();
}

// ============================================================
// WORK SHIFTS LOGIC (JORNADAS DE TRABALHO)
// ============================================================

async function promptStartJornada() {
    const activeVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    if (!activeVehicle) {
        alert("Por favor, adicione um veículo antes de iniciar a jornada.");
        return;
    }

    if (!state.isPremium) {
        const todayStr = new Date().toISOString().split('T')[0];
        const journeysToday = (state.jornadas || []).filter(j => j && j.date_start === todayStr);
        if (journeysToday.length >= 3) {
            alert("📊 Limite Diário: No Plano Gratuito você pode iniciar no máximo 3 jornadas por dia. Assine o Motrix VIP para ter jornadas ilimitadas!");
            return;
        }
    }

    if (!confirm("Deseja iniciar sua jornada de trabalho agora?")) {
        return;
    }

    const startKmStr = prompt("Confirme ou digite o KM atual do veículo para iniciar a jornada:", activeVehicle.km_actual || 0);
    if (startKmStr === null) return;
    const startKm = parseFloat(startKmStr) || 0;

    const now = new Date();
    const date_start = now.toISOString().split('T')[0];
    const time_start = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM

    const newJornada = {
        vehicle_id: state.activeVehicleId,
        date_start: date_start,
        time_start: time_start,
        km_start: startKm,
        date_end: '',
        time_end: '',
        km_end: 0,
        status: 'active'
    };

    const { data, error } = await window.db.jornadas.add(newJornada);
    if (error) {
        alert("Erro ao iniciar jornada: " + error.message);
    } else if (data && data.length > 0) {
        state.activeJornada = data[0];
        state.jornadas.unshift(state.activeJornada);
        saveState();
        updateJornadasUI();
        alert(`Jornada iniciada com sucesso às ${time_start}!`);
    }
}

async function promptEndJornada() {
    if (!state.activeJornada) return;

    if (!confirm("Deseja finalizar sua jornada de trabalho agora?")) {
        return;
    }

    const activeVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    const endKmStr = prompt("Confirme ou digite o KM atual do veículo para encerrar a jornada:", Math.max(state.activeJornada.km_start, activeVehicle ? activeVehicle.km_actual : 0));
    if (endKmStr === null) return;
    const endKm = parseFloat(endKmStr) || 0;

    if (endKm < state.activeJornada.km_start) {
        alert("O KM final não pode ser menor que o KM inicial (" + state.activeJornada.km_start + ").");
        return;
    }

    const now = new Date();
    const date_end = now.toISOString().split('T')[0];
    const time_end = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM

    const updatedData = {
        date_end: date_end,
        time_end: time_end,
        km_end: endKm,
        status: 'finished'
    };

    const { data, error } = await window.db.jornadas.update(state.activeJornada.id, updatedData);
    if (error) {
        alert("Erro ao finalizar jornada: " + error.message);
    } else if (data && data.length > 0) {
        const index = state.jornadas.findIndex(j => j.id === state.activeJornada.id);
        if (index !== -1) {
            state.jornadas[index] = { ...state.jornadas[index], ...updatedData };
        }
        state.activeJornada = null;
        saveState();
        updateJornadasUI();
        alert(`Jornada finalizada com sucesso às ${time_end}!`);
    }
}

function handleJornadaQuickActionClick() {
    if (state.activeJornada) {
        promptEndJornada();
    } else {
        promptStartJornada();
    }
}

function updateJornadasUI() {
    const active = state.activeJornada;
    
    // Dashboard banners
    const activeBanner = document.getElementById('dash-jornada-banner');
    const inactiveBanner = document.getElementById('dash-jornada-inactive-banner');
    const startTimeEl = document.getElementById('dash-jornada-start-time');

    if (active) {
        if (activeBanner) activeBanner.style.display = 'flex';
        if (inactiveBanner) inactiveBanner.style.display = 'none';
        if (startTimeEl) startTimeEl.innerText = active.time_start;
    } else {
        if (activeBanner) activeBanner.style.display = 'none';
        if (inactiveBanner) inactiveBanner.style.display = 'flex';
    }

    // Dynamic Journey Limit Indicator
    const todayStr = new Date().toISOString().split('T')[0];
    const journeysToday = (state.jornadas || []).filter(j => j && j.date_start === todayStr).length;

    const dashInactiveBannerText = document.querySelector('#dash-jornada-inactive-banner span.text-caption');
    if (dashInactiveBannerText) {
        if (state.isPremium) {
            dashInactiveBannerText.innerHTML = `Nenhuma jornada ativa • Hoje: <strong>${journeysToday}/Ilim.</strong>`;
        } else {
            dashInactiveBannerText.innerHTML = `Nenhuma jornada ativa • Hoje: <strong>${journeysToday}/3 (Grátis)</strong>`;
        }
    }

    const limitIndicator = document.getElementById('jornada-limit-indicator');
    if (limitIndicator) {
        if (state.isPremium) {
            limitIndicator.innerText = `Jornadas hoje: ${journeysToday} / Ilimitadas (Plano VIP 👑)`;
            limitIndicator.style.color = '#00ff88';
        } else {
            limitIndicator.innerText = `Jornadas hoje: ${journeysToday} / 3 (Plano Grátis)`;
            limitIndicator.style.color = 'var(--accent-orange)';
        }
    }

    // Quick Actions Shift Option UI
    const qaBtnText = document.getElementById('qa-jornada-text');
    const qaIconDiv = document.getElementById('qa-jornada-icon-div');
    const qaIcon = document.getElementById('qa-jornada-icon');

    if (qaBtnText && qaIconDiv && qaIcon) {
        if (active) {
            qaBtnText.innerText = "Finalizar Jornada";
            qaIconDiv.style.background = "#ff4d4d";
            qaIcon.setAttribute('data-lucide', 'square');
        } else {
            qaBtnText.innerText = "Iniciar Jornada";
            qaIconDiv.style.background = "#00ff88";
            qaIcon.setAttribute('data-lucide', 'play');
        }
        lucide.createIcons();
    }

    // Shifts View Card Toggle
    const activeCard = document.getElementById('jornada-active-card');
    const inactiveCard = document.getElementById('jornada-inactive-card');
    if (activeCard && inactiveCard) {
        if (active) {
            activeCard.style.display = 'block';
            inactiveCard.style.display = 'none';
            const activeDateStart = active.date_start || '';
            const activeTimeStart = active.time_start || '00:00';
            const dateParts = activeDateStart ? activeDateStart.split('-').reverse().slice(0, 2).join('/') : '';
            document.getElementById('active-jornada-start-time').innerText = activeTimeStart + (dateParts ? " (" + dateParts + ")" : "");
            document.getElementById('active-jornada-start-km').innerText = (active.km_start || 0).toLocaleString('pt-BR') + " KM";
            
            // Calculate active duration
            const startDateTime = new Date((activeDateStart || new Date().toISOString().split('T')[0]) + 'T' + activeTimeStart + ':00');
            const diffMs = new Date() - startDateTime;
            const diffHrs = Math.floor(diffMs / 3600000);
            const diffMins = Math.floor((diffMs % 3600000) / 60000);
            document.getElementById('active-jornada-duration').innerText = (isNaN(diffHrs) ? 0 : diffHrs) + "h " + (isNaN(diffMins) ? 0 : diffMins) + "m";
        } else {
            activeCard.style.display = 'none';
            inactiveCard.style.display = 'block';
        }
    }

    if (state.currentView === 'jornadas') {
        renderJornadas();
    }
    updateDashboardUI();
}

function renderJornadas() {
    const list = document.getElementById('jornadas-history-list');
    if (!list) return;

    list.innerHTML = '';

    const finishedJornadas = (state.jornadas || []).filter(j => j && j.status === 'finished');

    if (finishedJornadas.length === 0) {
        list.innerHTML = `<p class="text-caption" style="text-align: center; padding: 20px; opacity: 0.5;">Nenhuma jornada encerrada no histórico.</p>`;
        return;
    }

    // List all finished journeys
    finishedJornadas.forEach(j => {
        try {
            const date_start = j.date_start || '';
            const time_start = j.time_start || '00:00';
            const date_end = j.date_end || date_start || '';
            const time_end = j.time_end || '00:00';

            const startDateTime = new Date((date_start || new Date().toISOString().split('T')[0]) + 'T' + time_start + ':00');
            const endDateTime = new Date((date_end || new Date().toISOString().split('T')[0]) + 'T' + time_end + ':00');
            let diffMs = endDateTime - startDateTime;
            if (isNaN(diffMs)) diffMs = 0;
            const diffHrs = Math.floor(diffMs / 3600000);
            const diffMins = Math.floor((diffMs % 3600000) / 60000);

            // Filter fuel, maintenance, costs and billing logs linked to this journey
            const linkedBilling = (state.billingLogs || []).filter(log => log && log.jornada_id === j.id);
            const linkedFuel = (state.fuelLogs || []).filter(log => log && log.jornada_id === j.id);
            const linkedMaint = (state.maintenanceLogs || []).filter(log => log && log.jornada_id === j.id);
            const linkedCosts = (state.costsLogs || []).filter(log => log && log.jornada_id === j.id);

            const totalGanhos = linkedBilling.reduce((sum, log) => sum + (log.amount || 0), 0);
            const totalCombustivel = linkedFuel.reduce((sum, log) => sum + (log.total || 0), 0);
            const totalMaint = linkedMaint.reduce((sum, log) => sum + (log.cost || 0), 0);
            const totalCosts = linkedCosts.reduce((sum, log) => sum + (log.amount || 0), 0);

            const totalSpent = totalCombustivel + totalMaint + totalCosts;
            const netProfit = totalGanhos - totalSpent;

            const dateLabel = date_start ? date_start.split('-').reverse().join('/') : 'Sem data';
            const kmDriven = (j.km_end || 0) - (j.km_start || 0);

            const div = document.createElement('div');
            div.className = 'glass-card';
            div.style.marginBottom = '12px';
            div.style.borderLeft = `4px solid ${netProfit >= 0 ? '#00ff88' : '#ff4d4d'}`;
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div>
                        <strong style="font-size: 15px; color: white;">Jornada ${dateLabel}</strong>
                        <span class="text-caption" style="display: block; font-size: 11px; margin-top: 2px;">
                            <i data-lucide="clock" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle;"></i> 
                            ${time_start} às ${time_end} (${diffHrs}h ${diffMins}m)
                        </span>
                        <span class="text-caption" style="display: block; font-size: 11px;">
                            🏁 ${kmDriven > 0 ? kmDriven + ' KM rodados' : 'KM não calculado'} (${(j.km_start || 0)} KM a ${(j.km_end || 0)} KM)
                        </span>
                    </div>
                    <div style="text-align: right;">
                        <span class="text-caption" style="font-size: 9px; text-transform: uppercase; display: block; opacity: 0.6;">LUCRO LÍQUIDO</span>
                        <strong style="display: block; font-size: 16px; color: ${netProfit >= 0 ? '#00ff88' : '#ff4d4d'};">
                            R$ ${netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </strong>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 12px; color: #aaa;">Ganhos: <strong style="color: #00f2ff;">R$ ${totalGanhos.toFixed(2)}</strong></div>
                    <div style="font-size: 12px; color: #aaa; text-align: right;">Gastos: <strong style="color: #ff7675;">R$ ${totalSpent.toFixed(2)}</strong></div>
                </div>
            `;
            list.appendChild(div);
        } catch (e) {
            console.error("Erro ao renderizar jornada individual:", j, e);
        }
    });
    lucide.createIcons();
}

function switchHistoryTab(tab) {
    state.historyTab = tab;
    document.getElementById('tab-hist-fuel').classList.toggle('active', tab === 'fuel');
    document.getElementById('tab-hist-maint').classList.toggle('active', tab === 'maintenance');
    
    // Style adjustments for inactive tab
    const btns = document.querySelectorAll('.btn-tab');
    btns.forEach(b => {
        if (!b.classList.contains('active')) {
            b.style.background = 'transparent';
            b.style.color = '#888';
        } else {
            b.style.background = 'var(--accent-orange)';
            b.style.color = 'var(--bg-main)';
        }
    });

    renderFullHistory();
}

function renderFullHistory() {
    const list = document.getElementById('full-history-list');
    const countEl = document.getElementById('hist-records-count');
    if (!list) return;

    list.innerHTML = '';
    
    if (state.historyTab === 'fuel') {
        const filteredFuelLogs = state.fuelLogs.filter(log => log.vehicleId === state.activeVehicleId);
        countEl.innerText = `${filteredFuelLogs.length} registros`;
        filteredFuelLogs.forEach((log) => {
            const dateStr = new Date(log.date).toLocaleDateString('pt-BR');
            const pricePerL = log.total / log.liters;
            const costPerKm = log.consumption > 0 ? log.total / (log.liters * log.consumption) : 0;

            const div = document.createElement('div');
            div.className = 'glass-card';
            div.style.marginBottom = '15px';
            div.style.padding = '16px';
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                        <strong style="font-size: 16px; color: #fff;">${log.type}</strong>
                        <p class="text-caption" style="margin-top: 2px;">${dateStr}</p>
                    </div>
                    <div style="text-align: right;">
                        <strong style="font-size: 18px; color: var(--accent-orange);">R$ ${log.total.toFixed(2)}</strong>
                        <p class="text-caption" style="margin-top: 2px;">${log.km.toLocaleString('pt-BR')} km</p>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
                    <div><p class="text-caption">Litros</p><strong style="font-size: 13px;">${log.liters.toFixed(2)} L</strong></div>
                    <div><p class="text-caption">Preço/L</p><strong style="font-size: 13px;">R$ ${pricePerL.toFixed(2)}</strong></div>
                    <div><p class="text-caption">Consumo</p><strong style="font-size: 13px; color: var(--success);">${log.consumption > 0 ? log.consumption.toFixed(1) + ' km/L' : '--' }</strong></div>
                    <div><p class="text-caption">Custo/km</p><strong style="font-size: 13px;">R$ ${costPerKm > 0 ? costPerKm.toFixed(2) : '--'}</strong></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                    <span class="text-caption"><i data-lucide="map-pin" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px; color: var(--danger);"></i>${log.station}</span>
                    <button onclick="deleteFuelLog('${log.id}')" style="background: transparent; border: none; color: #ff4757; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="trash-2" style="width: 12px;"></i> Excluir
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
    } else {
        const filteredMaintLogs = state.maintenanceLogs.filter(m => m.vehicleId === state.activeVehicleId);
        countEl.innerText = `${filteredMaintLogs.length} registros`;
        filteredMaintLogs.forEach((m) => {
            const dateStr = new Date(m.date).toLocaleDateString('pt-BR');
            let kmRemaining = '∞';
            let nextKmStr = '-';
            let intervalStr = '-';
            
            if (m.intervalType === 'km') {
                const activeVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
                const diff = m.next - (activeVehicle ? activeVehicle.km_actual : 0);
                kmRemaining = diff > 0 ? diff.toLocaleString('pt-BR') + ' km' : 'Vencida';
                nextKmStr = m.next.toLocaleString('pt-BR');
                intervalStr = m.intervalVal.toLocaleString('pt-BR');
            }

            const div = document.createElement('div');
            div.className = 'glass-card';
            div.style.marginBottom = '15px';
            div.style.padding = '16px';
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                        <strong style="font-size: 16px; color: #fff;">${m.type}</strong>
                        <p class="text-caption" style="margin-top: 2px;">${dateStr}</p>
                    </div>
                    <div style="text-align: right;">
                        <strong style="font-size: 18px; color: var(--accent-orange);">R$ ${m.cost.toFixed(2)}</strong>
                        <div class="badge-alert" onclick="toggleMaintStatus('${m.id}')" style="margin-top: 8px; border: 1px solid ${m.status === 'concluido' ? 'var(--success)' : 'var(--accent-orange)'}; background: transparent; color: ${m.status === 'concluido' ? 'var(--success)' : 'var(--accent-orange)'}; font-size: 10px; padding: 2px 8px; cursor: pointer;" title="Clique para alterar status">
                            <i data-lucide="${m.status === 'concluido' ? 'check-circle' : 'clock'}" style="width: 10px; margin-right: 4px;"></i>${m.status === 'concluido' ? 'CONCLUÍDO' : 'PENDENTE'}
                        </div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 15px;">
                    <div><p class="text-caption">KM Realizada</p><strong style="font-size: 13px;">${m.km.toLocaleString('pt-BR')}</strong></div>
                    <div><p class="text-caption">Próxima</p><strong style="font-size: 13px;">${nextKmStr}</strong></div>
                    <div><p class="text-caption">Intervalo</p><strong style="font-size: 13px;">${intervalStr}</strong></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <div>
                        <p class="text-caption">KM Restante</p>
                        <strong style="font-size: 15px; color: #fff;">${kmRemaining}</strong>
                    </div>
                    <span style="color: var(--success); font-size: 12px;"><span style="display: inline-block; width: 8px; height: 8px; background: var(--success); border-radius: 50%; margin-right: 5px;"></span>OK</span>
                </div>
                <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <span class="text-caption"><i data-lucide="wrench" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>${m.station}</span>
                    <button onclick="deleteMaintenance('${m.id}')" style="background: transparent; border: none; color: #ff4757; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="trash-2" style="width: 12px;"></i> Excluir
                    </button>
                </div>
                <p class="text-caption" style="text-align: center; margin-top: 15px; color: ${m.status === 'concluido' ? 'var(--success)' : 'var(--accent-orange)'}; font-size: 11px; cursor: pointer;" onclick="toggleMaintStatus('${m.id}')">👉 Clique no selo (pendente/concluído) para alterar o status</p>
            `;
            list.appendChild(div);
        });
    }
    lucide.createIcons();
}

function toggleVehiclePicker() {
    const modal = document.getElementById('modal-vehicle-picker');
    if (!modal) return;
    
    modal.classList.toggle('flex-active');
    if (modal.classList.contains('flex-active')) {
        renderVehiclePickerList();
    }
}

function renderVehiclePickerList() {
    const list = document.getElementById('vehicle-picker-list');
    if (!list) return;

    list.innerHTML = '';
    state.vehicles.forEach((veh, index) => {
        const isLocked = !state.isPremium && index > 0;
        const isActive = veh.id === state.activeVehicleId;
        
        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.marginBottom = '12px';
        div.style.cursor = isLocked ? 'default' : 'pointer';
        div.style.opacity = isLocked ? '0.4' : '1';
        div.style.filter = isLocked ? 'grayscale(1)' : 'none';
        div.style.background = isActive ? 'rgba(255,140,0,0.1)' : 'rgba(255,255,255,0.05)';
        div.style.borderColor = isActive ? 'var(--accent-orange)' : 'var(--glass-border)';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        
        if (!isLocked) {
            div.onclick = () => switchVehicle(veh.id);
        }

        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                ${isLocked ? '<i data-lucide="lock" style="width: 14px; opacity: 0.6;"></i>' : ''}
                <div>
                    <strong style="display: block;">${veh.model}</strong>
                    <span class="text-caption">${veh.plate}</span>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${isActive ? '<i data-lucide="check" style="color: var(--accent-orange);"></i>' : ''}
                ${isLocked ? '<span style="font-size: 9px; font-weight: 700; opacity: 0.7;">VIP</span>' : ''}
            </div>
        `;
        list.appendChild(div);
    });
    lucide.createIcons();
}

async function handleDocUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!state.isPremium && state.documents.length >= 2) {
        alert("🔒 Limite gratuito de 2 documentos atingido na Carteira. Adquira o Premium para armazenamento ilimitado!");
        e.target.value = '';
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        alert("O arquivo é muito grande! Tamanho máximo de 2MB.");
        e.target.value = '';
        return;
    }

    const docName = prompt("Qual o nome/tipo deste documento?\n(Ex: CNH, CRLV, Seguro)");
    if (!docName) {
        e.target.value = '';
        return;
    }

    // Disable input while uploading
    e.target.disabled = true;

    try {
        const docData = {
            vehicle_id: state.activeVehicleId, 
            name: docName,
            type: file.type
        };

        const { data, error } = await window.db.documents.add(docData, file);
        if (error) throw error;
        
        if (data && data.length > 0) {
            const newDoc = data[0];
            state.documents.push({
                ...newDoc,
                vehicleId: newDoc.vehicle_id,
                data: newDoc.file_url
            });
            saveState();
            renderWallet();
        }
    } catch(err) {
        alert("Erro ao enviar documento: " + err.message);
    }

    e.target.disabled = false;
    e.target.value = '';
}

function renderWallet() {
    const list = document.getElementById('wallet-list');
    const storageMsg = document.getElementById('wallet-storage-msg');
    if (!list) return;

    // Filter documents by active vehicle OR personal (like CNH - let's keep all for now as per user image it's personal? No, CRV/CRLV is per car)
    // Actually user said CRLV, CRV (per car) and CNH (per driver). I'll show all documents but clearly mark if per car.
    
    list.innerHTML = '';
    
    if (state.documents.length === 0) {
        list.style.display = 'block';
        list.innerHTML = `<p class="text-caption" style="text-align: center; margin-top: 40px; opacity: 0.5;">Sua carteira está vazia.</p>`;
    } else {
        list.style.display = 'grid';
        state.documents
            .filter(doc => doc.vehicleId === state.activeVehicleId || !doc.vehicleId)
            .forEach(doc => {
            let icon = 'file-text';
            const nameLower = doc.name.toLowerCase();
            if (nameLower.includes('cnh')) icon = 'user';
            if (nameLower.includes('crlv') || nameLower.includes('crv')) icon = 'file-check';
            if (nameLower.includes('seguro')) icon = 'shield-check';
            if (nameLower.includes('gnv')) icon = 'flame';
            if (nameLower.includes('nota') || nameLower.includes('recibo')) icon = 'receipt';

            const card = document.createElement('div');
            card.className = 'glass-card';
            card.style.padding = '15px';
            card.style.position = 'relative';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'center';
            card.style.textAlign = 'center';

            card.innerHTML = `
                <i data-lucide="${icon}" style="width: 32px; height: 32px; color: var(--accent-orange); margin-bottom: 10px; margin-left: auto; margin-right: auto; display: block;"></i>
                <strong style="font-size: 13px; display: block; margin-bottom: 4px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;" title="${doc.name}">${doc.name}</strong>
                <div style="display: flex; gap: 10px; margin-top: 10px; justify-content: center;">
                    <button onclick="viewDocument('${doc.id}')" class="btn-primary" style="padding: 5px 10px; font-size: 10px; width:auto; margin-top:0;">Abrir</button>
                    <button onclick="deleteDocument('${doc.id}')" class="btn-icon btn-icon-danger" style="padding: 5px;"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                </div>
            `;
            list.appendChild(card);
        });
    }

    if (storageMsg && !state.isPremium) {
        storageMsg.innerHTML = `Sua carteira tem ${state.documents.length}/2 arquivos (Limite Grátis)`;
    } else if (storageMsg) {
        storageMsg.innerHTML = `Espaço VIP: ${state.documents.length} arquivos salvos`;
    }

    lucide.createIcons();
}

function viewDocument(id) {
    const doc = state.documents.find(d => d.id === id);
    if (!doc) return;

    const modal = document.getElementById('doc-preview-modal');
    const content = document.getElementById('doc-preview-content');
    
    content.innerHTML = '';
    
    if (doc.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = doc.data;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        content.appendChild(img);
    } else if (doc.type === 'application/pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = doc.data;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        content.appendChild(iframe);
    } else {
        content.innerHTML = `<p style="color: white;">Formato não suportado para pré-visualização. Tente baixar o arquivo.</p>`;
    }

    modal.style.display = 'flex';
    lucide.createIcons();
}

function closeDocPreview() {
    document.getElementById('doc-preview-modal').style.display = 'none';
}

async function deleteDocument(id) {
    if (confirm("Deseja apagar permanentemente este documento da nuvem?")) {
        const doc = state.documents.find(d => d.id === id);
        if (doc) {
            const { error } = await window.db.documents.delete(id, doc.data);
            if (error) {
                alert("Erro ao excluir documento: " + error.message);
                return;
            }
        }
        state.documents = state.documents.filter(d => d.id !== id);
        saveState();
        renderWallet();
    }
}

// COST LOGIC
document.getElementById('form-costs').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('cost-amount').value);
    const platformVal = document.getElementById('cost-platform-value')?.value || '';
    const logData = {
        date: document.getElementById('cost-date').value + 'T12:00:00Z',
        vehicle_id: state.activeVehicleId,
        type: document.getElementById('cost-type-value').value,
        amount: amount,
        platform: platformVal,
        description: document.getElementById('cost-desc').value || '',
        obs: document.getElementById('cost-obs').value || ''
    };
    if (state.activeJornada) {
        logData.jornada_id = state.activeJornada.id;
    }

    const { data, error } = await window.db.costs.add(logData);
    if (error) {
        alert("Erro ao gravar custo: " + error.message);
    } else if (data && data.length > 0) {
        const savedCost = data[0];
        savedCost.vehicleId = savedCost.vehicle_id;
        savedCost.desc = savedCost.description;
        state.costsLogs.push(savedCost);
    }

    saveState();
    switchView('costs');
    e.target.reset();
});

// Category Chip Selector
const costTypeChips = document.querySelectorAll('#cost-type-selector .btn-chip');
costTypeChips.forEach(chip => {
    chip.addEventListener('click', () => {
        costTypeChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('cost-type-value').value = chip.dataset.type;
    });
});

// Cost Platform Chip Selector
const costPlatformChips = document.querySelectorAll('#cost-platform-selector .btn-chip-sm');
costPlatformChips.forEach(chip => {
    chip.addEventListener('click', () => {
        costPlatformChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('cost-platform-value').value = chip.dataset.plat;
    });
});

function renderCosts() {
    const list = document.getElementById('costs-list');
    const summary = document.getElementById('costs-summary-by-type');
    const totalEl = document.getElementById('stat-costs-total');
    if (!list || !summary || !totalEl) return;

    list.innerHTML = '';
    summary.innerHTML = '';

    // Calculate Totals
    let total = 0;
    const byType = {};
    
    state.costsLogs
        .filter(c => c.vehicleId === state.activeVehicleId || !c.vehicleId)
        .forEach(c => {
        total += c.amount;
        byType[c.type] = (byType[c.type] || 0) + c.amount;
    });

    totalEl.innerText = `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    // Render Summary by Type
    for (const [type, val] of Object.entries(byType)) {
        let icon = 'layers';
        if (type === 'Combustível') icon = 'fuel';
        if (type === 'Manutenção') icon = 'tool';
        if (type === 'Pedágio') icon = 'map';
        if (type === 'Estacionamento') icon = 'monitor';
        if (type === 'Limpeza') icon = 'sparkles';
        if (type === 'Seguro') icon = 'shield';
        if (type === 'IPVA') icon = 'file-text';

        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '12px 16px';
        div.style.marginBottom = '8px';
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <i data-lucide="${icon}" style="width: 18px; height: 18px; color: #ff7675;"></i>
                <strong>${type}</strong>
            </div>
            <strong>R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
        `;
        summary.appendChild(div);
    }

    // Render History
    state.costsLogs
        .filter(c => c.vehicleId === state.activeVehicleId || !c.vehicleId)
        .sort((a,b) => new Date(b.date) - new Date(a.date))
        .forEach(c => {
        const platformBadge = c.platform ? `<span style="display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; background: rgba(255,140,0,0.12); color: var(--accent-orange); border: 1px solid rgba(255,140,0,0.2);">${c.platform}</span>` : '';
        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.borderLeft = '4px solid #ff7675';
        div.style.marginBottom = '12px';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h4 style="margin-bottom: 4px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">${c.type}${platformBadge}</h4>
                    <span class="text-caption">${c.desc || 'Sem descrição'}</span><br>
                    <span class="text-caption" style="font-size: 11px; opacity: 0.7;">${new Date(c.date).toLocaleDateString('pt-BR')}</span>
                </div>
                <div style="text-align: right;">
                    <strong style="color: #ff7675;">R$ ${c.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    <div style="margin-top: 10px;">
                        <button onclick="deleteCost('${c.id}')" class="text-caption" style="color: var(--danger); border: none; background: none; font-weight: 600; cursor: pointer;">Deletar</button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(div);
    });

    lucide.createIcons();
}

async function deleteCost(id) {
    if (confirm("Deseja apagar este registro de custo da nuvem?")) {
        const { error } = await window.db.costs.delete(id);
        if (error) {
            alert("Erro ao excluir: " + error.message);
            return;
        }
        state.costsLogs = state.costsLogs.filter(c => c.id !== id);
        saveState();
        renderCosts();
    }
}

// ANALYTICS LOGIC
// ANALYTICS LOGIC helper
function isWithinPeriod(dateStr, period) {
    if (!dateStr) return false;
    if (period === 'all') return true;
    
    const logDate = new Date(dateStr);
    logDate.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (period === 'today') return logDate.getTime() === today.getTime();
    if (period === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);
        weekAgo.setHours(0,0,0,0);
        return logDate >= weekAgo;
    }
    if (period === 'month') return logDate.getMonth() === today.getMonth() && logDate.getFullYear() === today.getFullYear();
    if (period === 'year') return logDate.getFullYear() === today.getFullYear();
    
    if (period === 'custom') {
        const startRaw = document.getElementById('ana-start-date').value;
        const endRaw = document.getElementById('ana-end-date').value;
        if (!startRaw || !endRaw) return true; // Show all if empty
        const start = new Date(startRaw + 'T00:00:00');
        const end = new Date(endRaw + 'T23:59:59');
        return logDate >= start && logDate <= end;
    }
    return true;
}

function renderAnalytics() {
    const lockedEl = document.getElementById('analytics-locked');
    const contentEl = document.getElementById('analytics-content');
    const customRangeEl = document.getElementById('ana-custom-range');
    if (!lockedEl || !contentEl) return;

    if (!state.isPremium) {
        lockedEl.style.display = 'block';
        contentEl.style.display = 'none';
        return;
    }

    lockedEl.style.display = 'none';
    contentEl.style.display = 'block';

    const period = document.getElementById('ana-period-select').value;
    if (customRangeEl) {
        customRangeEl.style.display = (period === 'custom') ? 'grid' : 'none';
    }

    const profitEl = document.getElementById('ana-profit-net');
    if (!profitEl) return;

    const vId = state.activeVehicleId;

    // 1. Filter Logs (Include orphans as fallback for the active car)
    const filteredBilling = state.billingLogs.filter(l => 
        (l.vehicleId === vId || !l.vehicleId) && isWithinPeriod(l.date, period)
    );
    const filteredCosts = state.costsLogs.filter(l => 
        (l.vehicleId === vId || !l.vehicleId) && isWithinPeriod(l.date, period)
    );

    const totalRevenue = filteredBilling.reduce((sum, l) => sum + l.amount, 0);
    const totalCosts = filteredCosts.reduce((s, c) => s + c.amount, 0);
    const netProfit = totalRevenue - totalCosts;

    profitEl.innerText = `R$ ${netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    profitEl.style.color = 'black'; 

    const msgEl = document.getElementById('ana-profit-msg');
    if (msgEl) msgEl.innerText = `(Ganhos R$ ${totalRevenue.toFixed(2)} - Gastos R$ ${totalCosts.toFixed(2)})`;

    // Calculate Journey Performance Metrics
    const finishedJornadas = (state.jornadas || []).filter(j => 
        j && j.status === 'finished' && (j.vehicle_id === vId || !j.vehicle_id) && isWithinPeriod(j.date_start, period)
    );

    let totalDurationMs = 0;
    let totalKmJornadas = 0;
    let totalProfitJornadas = 0;

    finishedJornadas.forEach(j => {
        const date_start = j.date_start || '';
        const time_start = j.time_start || '00:00';
        const date_end = j.date_end || date_start || '';
        const time_end = j.time_end || '00:00';

        const startDateTime = new Date((date_start || new Date().toISOString().split('T')[0]) + 'T' + time_start + ':00');
        const endDateTime = new Date((date_end || new Date().toISOString().split('T')[0]) + 'T' + time_end + ':00');
        let diffMs = endDateTime - startDateTime;
        if (isNaN(diffMs)) diffMs = 0;
        if (diffMs > 0) totalDurationMs += diffMs;

        const kmDriven = (j.km_end || 0) - (j.km_start || 0);
        if (kmDriven > 0) totalKmJornadas += kmDriven;

        // Calculate profit for this shift
        const linkedBilling = state.billingLogs.filter(log => log.jornada_id === j.id);
        const linkedFuel = state.fuelLogs.filter(log => log.jornada_id === j.id);
        const linkedMaint = state.maintenanceLogs.filter(log => log.jornada_id === j.id);
        const linkedCosts = state.costsLogs.filter(log => log.jornada_id === j.id);

        const shiftGanhos = linkedBilling.reduce((sum, log) => sum + (log.amount || 0), 0);
        const shiftGastos = linkedFuel.reduce((sum, log) => sum + (log.total || 0), 0) +
                            linkedMaint.reduce((sum, log) => sum + (log.cost || 0), 0) +
                            linkedCosts.reduce((sum, log) => sum + (log.amount || 0), 0);
        totalProfitJornadas += (shiftGanhos - shiftGastos);
    });

    const totalHours = totalDurationMs / 3600000;
    const hrsPart = Math.floor(totalHours);
    const minsPart = Math.round((totalHours - hrsPart) * 60);

    const profitPerHour = totalHours > 0 ? totalProfitJornadas / totalHours : 0;
    const profitPerKm = totalKmJornadas > 0 ? totalProfitJornadas / totalKmJornadas : 0;

    // Update UI Elements
    const hoursEl = document.getElementById('ana-jornadas-hours');
    const profitHourEl = document.getElementById('ana-jornadas-profit-hour');
    const kmEl = document.getElementById('ana-jornadas-km');
    const profitKmEl = document.getElementById('ana-jornadas-profit-km');

    if (hoursEl) hoursEl.innerText = `${hrsPart}h ${minsPart}m`;
    if (profitHourEl) profitHourEl.innerText = `R$ ${profitPerHour.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (kmEl) kmEl.innerText = `${totalKmJornadas.toLocaleString('pt-BR')} KM`;
    if (profitKmEl) profitKmEl.innerText = `R$ ${profitPerKm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    // 2. Clear previous charts
    Object.values(charts).forEach(chart => { if(chart) chart.destroy(); });

    // 3. Chart: Revenue vs Costs (Trend)
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });

    const dailyRev = last7Days.map(date => 
        state.billingLogs.filter(l => l.date.split('T')[0] === date && (l.vehicleId === vId || !l.vehicleId)).reduce((s, l) => s + l.amount, 0)
    );
    const dailyCost = last7Days.map(date => 
        state.costsLogs.filter(l => l.date === date && (l.vehicleId === vId || !l.vehicleId)).reduce((s, l) => s + l.amount, 0)
    );

    const ctxRC = document.getElementById('chart-revenue-vs-costs').getContext('2d');
    charts.revVsCosts = new Chart(ctxRC, {
        type: 'bar',
        data: {
            labels: last7Days.map(d => d.split('-')[2] + '/' + d.split('-')[1]),
            datasets: [
                { label: 'Ganhos', data: dailyRev, backgroundColor: '#00f2ff', borderRadius: 4 },
                { label: 'Gastos', data: dailyCost, backgroundColor: '#ff7675', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false }, ticks: { color: '#888', font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } }
            },
            plugins: { legend: { position: 'top', align: 'end', labels: { color: 'white', boxWidth: 10, font: { size: 10 } } } }
        }
    });

    // 4. Chart: Costs Breakdown
    const byType = {};
    filteredCosts.forEach(c => byType[c.type] = (byType[c.type] || 0) + c.amount);
    
    const ctxBreakdown = document.getElementById('chart-costs-breakdown').getContext('2d');
    charts.breakdown = new Chart(ctxBreakdown, {
        type: 'doughnut',
        data: {
            labels: Object.keys(byType),
            datasets: [{
                data: Object.values(byType).map(v => v.toFixed(2)),
                backgroundColor: ['#ff7675', '#00f2ff', '#ffb800', '#00ff88', '#ff8c00', '#a29bfe', '#fab1a0', '#74b9ff'],
                borderWidth: 0,
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: 'white', boxWidth: 10, font: { size: 10 } } } }
        }
    });

    // 5. Chart: Fuel Efficiency
    const sortedFuel = [...state.fuelLogs].filter(f => f.vehicleId === vId).sort((a,b) => new Date(a.date) - new Date(b.date));
    const fuelData = sortedFuel.filter(l => l.consumption > 0);

    const ctxEff = document.getElementById('chart-fuel-efficiency').getContext('2d');
    charts.efficiency = new Chart(ctxEff, {
        type: 'line',
        data: {
            labels: fuelData.map(l => new Date(l.date).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})),
            datasets: [{
                label: 'km/L',
                data: fuelData.map(l => l.consumption.toFixed(2)),
                borderColor: '#ff8c00',
                backgroundColor: 'rgba(255, 140, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#ff8c00'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { size: 10 } } },
                x: { ticks: { color: '#888', font: { size: 10 } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function switchVehicle(id) {
    state.activeVehicleId = id;
    saveState();
    // Close picker modal if open
    const picker = document.getElementById('modal-vehicle-picker');
    if (picker) {
        picker.classList.remove('flex-active');
        picker.style.display = 'none';
    }
}

// --- VEHICLE CONFIG MODAL SCREENS ---
function showVehicleList() {
    document.getElementById('veh-list-screen').style.display = 'block';
    document.getElementById('veh-form-screen').style.display = 'none';
    renderVehicleConfigList();
}

function showVehicleForm(id = null) {
    if (!id && !state.isPremium && state.vehicles.length >= 1) {
        alert("📊 No Plano Gratuito você pode ter apenas 1 veículo. Assine o Motrix VIP para gerenciar sua frota completa!");
        return;
    }

    document.getElementById('veh-list-screen').style.display = 'none';
    document.getElementById('veh-form-screen').style.display = 'block';
    
    const titleEl = document.getElementById('veh-form-title');
    const form = document.getElementById('form-vehicle');
    const deleteBtn = document.getElementById('btn-delete-vehicle');
    
    form.reset();
    document.getElementById('veh-id').value = id || '';
    
    if (id) {
        titleEl.innerText = "Editar Veículo";
        const v = state.vehicles.find(v => v.id === id);
        if (v) {
            document.getElementById('veh-model').value = v.model;
            document.getElementById('veh-plate').value = v.plate;
            document.getElementById('veh-renavam').value = v.renavam || '';
            document.getElementById('veh-chassi').value = v.chassi || '';
            document.getElementById('veh-color').value = v.color || '';
            document.getElementById('veh-motor').value = v.motor || '';
            document.getElementById('veh-year').value = v.year;
            document.getElementById('veh-km').value = v.initialKm;
            document.getElementById('veh-obs').value = v.obs || '';
        }
        deleteBtn.style.display = state.vehicles.length > 1 ? 'block' : 'none';
    } else {
        titleEl.innerText = "Novo Veículo";
        deleteBtn.style.display = 'none';
    }
}

function renderVehicleConfigList() {
    const list = document.getElementById('veh-config-list');
    if (!list) return;
    list.innerHTML = '';

    state.vehicles.forEach((v, index) => {
        const isLocked = !state.isPremium && index > 0;
        const isActive = v.id === state.activeVehicleId;

        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style.padding = '12px 16px';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.opacity = isLocked ? '0.5' : '1';
        div.style.filter = isLocked ? 'grayscale(1)' : 'none';
        div.style.cursor = isLocked ? 'default' : 'pointer';
        
        if (!isLocked) {
            div.onclick = () => showVehicleForm(v.id);
        }

        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                ${isLocked ? '<i data-lucide="lock" style="width: 14px;"></i>' : ''}
                <div>
                    <p style="font-weight: 700; margin-bottom: 2px;">${v.model} ${isActive ? '<span class="badge-alert" style="font-size: 8px; padding: 2px 4px;">ATIVO</span>' : ''}</p>
                    <p class="text-caption" style="font-size: 11px;">Placa: ${v.plate}</p>
                </div>
            </div>
            ${isLocked ? '<span style="font-size: 10px; font-weight: 800; opacity: 0.5;">VIP</span>' : '<i data-lucide="chevron-right" style="width: 16px; opacity: 0.5;"></i>'}
        `;
        list.appendChild(div);
    });
    lucide.createIcons();
}

async function deleteVehicle() {
    const id = document.getElementById('veh-id').value; // Now it's a UUID string
    if (!id) return;

    if (state.vehicles.length <= 1) {
        alert("Você deve ter pelo menos um veículo cadastrado.");
        return;
    }

    if (confirm("ATENÇÃO: Diferente do offline, apagar o veículo na NUVEM irá deletar em segurança TODOS os registros e fotos vinculados a ele na base de dados para economizar espaço.\n\nTem certeza que deseja apagar este veículo permanentemente?")) {
        const btn = document.getElementById('btn-delete-vehicle');
        if (btn) btn.innerText = "Apagando...";

        const { error } = await window.db.vehicles.delete(id);
        
        if (error) {
            alert("Erro ao excluir veículo: " + error.message);
            if (btn) btn.innerText = "Excluir";
            return;
        }

        state.vehicles = state.vehicles.filter(v => v.id !== id);
        if (state.activeVehicleId === id) {
            state.activeVehicleId = state.vehicles[0].id;
        }
        
        if (btn) btn.innerText = "Excluir";
        
        saveState(); // Backup local state
        showVehicleList();
        updateDashboardUI();
    }
}

function becomePremium() {
    if (state.isPremium) {
        alert("Você já é um usuário VIP Motrix! Aproveite todos os recursos.");
        return;
    }
    const modal = document.getElementById('modal-vip-plans');
    if (modal) {
        // Reseta o estado do modal de pagamento para o padrão
        const btn = document.getElementById('btn-start-checkout');
        const pixArea = document.getElementById('pix-payment-area');
        if (btn) btn.style.display = 'block';
        if (pixArea) pixArea.style.display = 'none';

        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeVipModal() {
    const modal = document.getElementById('modal-vip-plans');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

async function startCheckout() {
    const user = window.currentUser || currentUser;
    if (!user) {
        alert("Por favor, faça login antes de assinar o plano.");
        return;
    }

    const btn = document.getElementById('btn-start-checkout');
    const loading = document.getElementById('checkout-loading');
    if (btn) btn.disabled = true;
    if (loading) loading.style.display = 'block';

    try {
        // Busca dados do perfil para enviar à API de checkout transparente
        let name = "";
        let phone = "";
        try {
            const { data: cloudProfile } = await window.db.profile.get();
            if (cloudProfile) {
                name = cloudProfile.name || "";
                phone = cloudProfile.phone || "";
            }
        } catch(e) { console.warn("Erro ao buscar perfil:", e); }

        const functionUrl = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
            ? "http://127.0.0.1:5001/motrix-18f53/us-central1/createPixPayment"
            : "https://us-central1-motrix-18f53.cloudfunctions.net/createPixPayment";
        
        const response = await fetch(functionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userId: user.uid,
                email: user.email,
                name: name,
                phone: phone
            })
        });

        if (!response.ok) {
            throw new Error("Erro na resposta do servidor de pagamento.");
        }

        const data = await response.json();
        if (data && data.brCode && data.brCodeBase64) {
            if (btn) btn.style.display = 'none';
            
            const pixArea = document.getElementById('pix-payment-area');
            const qrImage = document.getElementById('pix-qr-image');
            const copiaCola = document.getElementById('pix-copia-cola-text');
            
            if (qrImage) qrImage.src = `data:image/png;base64,${data.brCodeBase64}`;
            if (copiaCola) copiaCola.value = data.brCode;
            if (pixArea) pixArea.style.display = 'block';

            // Escuta atualizações do perfil em tempo real para ativar assim que o webhook atualizar
            const userDocRef = firebase.firestore().collection('profiles').doc(user.uid);
            const unsubscribe = userDocRef.onSnapshot(doc => {
                if (doc.exists && doc.data().is_premium) {
                    unsubscribe();
                    alert("👑 Parabéns! Seu pagamento via PIX foi confirmado e o VIP foi ativado com sucesso!");
                    location.reload();
                }
            });
        } else {
            throw new Error("Dados de pagamento PIX não recebidos.");
        }

    } catch (err) {
        console.error("Erro no checkout:", err);
        alert("Não foi possível iniciar o checkout. Por favor, tente novamente mais tarde.");
    } finally {
        if (btn) btn.disabled = false;
        if (loading) loading.style.display = 'none';
    }
}

function cancelPremium() {
    if (confirm('Deseja desativar o modo VIP para testes?')) {
        state.isPremium = false;
        saveState();
        location.reload();
        alert('Modo Gratuito reativado.');
    }
}

function addNewFromHistory() {
    if (state.historyTab === 'fuel') {
        switchView('fuel');
    } else {
        switchView('maintenance');
    }
}

function exportHistoryPDF() {
    if (!state.isPremium) {
        alert("📊 Recurso VIP: A exportação de relatórios em PDF está disponível apenas no plano Motrix VIP!");
        return;
    }

    if (!window.jspdf) {
        alert("O gerador de PDF está carregando, por favor tente novamente em alguns segundos.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const isFuel = state.historyTab === 'fuel';
    const title = isFuel ? 'Histórico de Abastecimento' : 'Histórico de Manutenção';
    const activeVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    const vehName = activeVehicle ? `${activeVehicle.model} (${activeVehicle.year})` : 'Veículo Motrix';
    const vehPlate = activeVehicle ? activeVehicle.plate : '---';
    
    // BRANDING HEADER
    doc.setFillColor(255, 140, 0); // Motrix Orange
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("MOTRIX", 14, 25);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Gestão Inteligente de Veículos", 14, 32);

    // REPORT INFO
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(16);
    doc.text(title, 14, 55);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 58, 196, 58);

    doc.setFontSize(11);
    doc.text(`Veículo: ${vehName}`, 14, 68);
    doc.text(`Placa: ${vehPlate}`, 140, 68);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 75);

    // Table
    if (isFuel) {
        const headers = [['Data', 'Tipo', 'KM', 'Litros', 'Total (R$)', 'Consumo']];
        const data = state.fuelLogs.sort((a,b) => new Date(b.date) - new Date(a.date)).map(l => [
            new Date(l.date).toLocaleDateString('pt-BR'),
            l.type,
            l.km.toLocaleString('pt-BR'),
            l.liters.toFixed(2),
            l.total.toFixed(2),
            l.consumption > 0 ? l.consumption.toFixed(2) + ' km/L' : '--'
        ]);
        doc.autoTable({
            startY: 85,
            head: headers,
            body: data,
            theme: 'striped',
            headStyles: { fillColor: [255, 140, 0] }
        });
    } else {
        const headers = [['Data', 'Serviço', 'KM', 'Próxima (KM)', 'Custo (R$)', 'Mecânico']];
        const data = state.maintenanceLogs.sort((a,b) => new Date(b.date) - new Date(a.date)).map(m => [
            new Date(m.date).toLocaleDateString('pt-BR'),
            m.type,
            m.km.toLocaleString('pt-BR'),
            m.intervalType === 'km' ? m.next.toLocaleString('pt-BR') : 'Data',
            m.cost.toFixed(2),
            m.station || '--'
        ]);
        doc.autoTable({
            startY: 85,
            head: headers,
            body: data,
            theme: 'striped',
            headStyles: { fillColor: [255, 140, 0] }
        });
    }

    doc.save(`Motrix_Relatorio_${isFuel ? 'Abastecimento' : 'Manutencao'}_${vehPlate}.pdf`);
}

function promptResetAll() {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const userInput = prompt(`CUIDADO: Isso irá apagar permanentemente todos os registros de abastecimento, manutenção e faturamento.\n\nDigite o código [ ${code} ] para confirmar a exclusão:`);
    
    if (userInput === code) {
        localStorage.removeItem('motrix_state');
        alert("Todos os dados foram apagados com sucesso.");
        location.reload();
    } else if (userInput !== null) {
        alert("Código incorreto. Operação cancelada.");
    }
}

// QUICK ACTIONS LOGIC
function toggleQuickActions() {
    const overlay = document.getElementById('quick-actions-overlay');
    const fab = document.getElementById('fab-main');
    
    const isActive = overlay.classList.contains('active');
    
    if (isActive) {
        overlay.classList.remove('active');
        fab.classList.remove('active');
    } else {
        overlay.classList.add('active');
        fab.classList.add('active');
    }
}

// NET PROFIT EXPLANATION MODAL LOGIC
function showProfitCalculationModal() {
    const modal = document.getElementById('modal-profit-explanation');
    if (!modal) return;

    // Get current active vehicle
    const activeVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    if (!activeVehicle) return;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const filterThisMonth = (log) => {
        if (!log.date || log.vehicleId !== state.activeVehicleId) return false;
        const d = new Date(log.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    };

    const fuelMonthLogs = (state.fuelLogs || []).filter(filterThisMonth);
    const maintMonthLogs = (state.maintenanceLogs || []).filter(filterThisMonth);
    const costsMonthLogs = (state.costsLogs || []).filter(filterThisMonth);
    const billingMonthLogs = (state.billingLogs || []).filter(l => {
        if (l.vehicleId !== state.activeVehicleId) return false;
        const d = new Date(l.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalFuelMonth = fuelMonthLogs.reduce((acc, log) => acc + (log.total || 0), 0);
    const totalMaintMonth = maintMonthLogs.reduce((acc, log) => acc + (log.cost || 0), 0);
    const totalGeneralCostsMonth = costsMonthLogs.reduce((acc, log) => acc + (log.amount || 0), 0);
    const totalRevenueMonth = billingMonthLogs.reduce((acc, log) => acc + (log.amount || 0), 0);

    const totalSpentMonth = totalFuelMonth + totalMaintMonth;
    const netProfitMonth = totalRevenueMonth - totalSpentMonth;

    document.getElementById('explain-faturamento').innerText = `R$ ${totalRevenueMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('explain-combustivel').innerText = `- R$ ${totalFuelMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('explain-manutencao').innerText = `- R$ ${totalMaintMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('explain-outros').innerText = `- R$ ${totalGeneralCostsMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('explain-lucro').innerText = `R$ ${netProfitMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    modal.style.display = 'flex';
    modal.classList.add('flex-active');
}

function closeProfitExplanationModal() {
    const modal = document.getElementById('modal-profit-explanation');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('flex-active');
    }
}
