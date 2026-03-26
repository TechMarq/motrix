-- ========================================================
-- MOTRIX - SUPABASE SQL SCHEMA (VERSÃO LIMPA/RESET)
-- ========================================================
-- Copie TODO o código abaixo e cole no "SQL Editor" do Supabase.
-- Esse script vai limpar qualquer conflito anterior e refazer tudo do zero!
-- ========================================================

-- 1. LIMPEZA (Apaga se já existir para evitar o erro "already exists")
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.billing_logs CASCADE;
DROP TABLE IF EXISTS public.costs_logs CASCADE;
DROP TABLE IF EXISTS public.maintenance_logs CASCADE;
DROP TABLE IF EXISTS public.fuel_logs CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.vehicles CASCADE;

-- ========================================================
-- 2. CRIAÇÃO DAS TABELAS
-- ========================================================

-- TABELA: vehicles (Meus Veículos)
CREATE TABLE public.vehicles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    plate TEXT NOT NULL,
    renavam TEXT,
    chassi TEXT,
    color TEXT,
    motor TEXT,
    year INT NOT NULL,
    initial_km INT NOT NULL,
    km_actual INT NOT NULL,
    obs TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários acessam apenas seus próprios veículos" 
    ON public.vehicles FOR ALL USING (auth.uid() = user_id);

-- TABELA: fuel_logs (Abastecimentos)
CREATE TABLE public.fuel_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    type TEXT NOT NULL,
    station TEXT,
    km INT NOT NULL,
    liters NUMERIC NOT NULL,
    total NUMERIC NOT NULL,
    consumption NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.fuel_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários acessam apenas seus próprios abastecimentos" 
    ON public.fuel_logs FOR ALL USING (auth.uid() = user_id);

-- TABELA: maintenance_logs (Manutenções)
CREATE TABLE public.maintenance_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    type TEXT NOT NULL,
    station TEXT,
    km INT NOT NULL,
    cost NUMERIC NOT NULL,
    obs TEXT,
    status TEXT DEFAULT 'pendente',
    interval_type TEXT DEFAULT 'none',
    interval_val INT,
    next_km INT,
    next_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários acessam apenas suas próprias manutenções" 
    ON public.maintenance_logs FOR ALL USING (auth.uid() = user_id);

-- TABELA: costs_logs (Outros Custos)
CREATE TABLE public.costs_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    obs TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.costs_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários acessam apenas seus próprios custos" 
    ON public.costs_logs FOR ALL USING (auth.uid() = user_id);

-- TABELA: billing_logs (Ganhos/Faturamentos)
CREATE TABLE public.billing_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    platform TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    km INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.billing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários acessam apenas seus próprios faturamentos" 
    ON public.billing_logs FOR ALL USING (auth.uid() = user_id);

-- TABELA: documents (Carteira de Documentos)
CREATE TABLE public.documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    file_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários acessam apenas seus próprios documentos" 
    ON public.documents FOR ALL USING (auth.uid() = user_id);

-- ========================================================
-- SISTEMA DE ASSINATURA (Stripe / PayPal - VIP)
-- ========================================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    is_premium BOOLEAN DEFAULT FALSE,
    payment_provider TEXT,               
    stripe_customer_id TEXT,             
    subscription_id TEXT,                
    subscription_status TEXT,            
    current_period_end TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem apenas seu próprio perfil" 
    ON public.profiles FOR SELECT USING (auth.uid() = id);

-- ========================================================
-- GATILHO (TRIGGER) PARA NOVAS CONTAS
-- ========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- FINALIZADO! Não se esqueça de criar o Bucket "motrix_docs" no painel Storage.
