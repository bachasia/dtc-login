import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import type {
  CreateGroupInput,
  CreateProfileInput,
  CreateProxyInput,
  Group,
  Profile,
  Proxy,
  Session,
  UpdateProfileInput,
} from '@shared/types'

type BrowserStartResponse = Awaited<
  ReturnType<Window['electronAPI']['browser']['start']>
>
type BrowserStopResponse = Awaited<
  ReturnType<Window['electronAPI']['browser']['stop']>
>

type FingerprintGenerateInput = {
  os?: Array<'windows' | 'macos' | 'linux'>
  locale?: string
}

type LocalApiSettings = Awaited<
  ReturnType<Window['electronAPI']['api']['getSettings']>
>

type LocalApiPatch = {
  enabled?: boolean
  port?: number
  apiKey?: string
}

type LocalApiUpdateResult = Awaited<
  ReturnType<Window['electronAPI']['api']['updateSettings']>
>

type CamoufoxStatus = Awaited<
  ReturnType<Window['electronAPI']['camoufox']['status']>
>

type CamoufoxDownloadResult = Awaited<
  ReturnType<Window['electronAPI']['camoufox']['downloadCurrent']>
>

type ProfileTemplate = Awaited<
  ReturnType<Window['electronAPI']['profiles']['templates']>
>[number]

type ImportCookiesResult = Awaited<
  ReturnType<Window['electronAPI']['profiles']['importCookies']>
>

export function useProfiles(groupId?: string): UseQueryResult<Profile[]> {
  return useQuery<Profile[]>({
    queryKey: ['profiles', groupId ?? 'all'],
    queryFn: () => window.electronAPI.profiles.list(groupId),
  })
}

export function useGroups(): UseQueryResult<Group[]> {
  return useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: () => window.electronAPI.groups.list(),
  })
}

export function useProfileTemplates(): UseQueryResult<ProfileTemplate[]> {
  return useQuery<ProfileTemplate[]>({
    queryKey: ['profile-templates'],
    queryFn: () => window.electronAPI.profiles.templates(),
  })
}

export function useProxies(): UseQueryResult<Proxy[]> {
  return useQuery<Proxy[]>({
    queryKey: ['proxies'],
    queryFn: () => window.electronAPI.proxies.list(),
  })
}

export function useCreateProfile(): UseMutationResult<
  Profile,
  Error,
  CreateProfileInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateProfileInput) =>
      window.electronAPI.profiles.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useUpdateProfile(): UseMutationResult<
  Profile,
  Error,
  { id: string; data: UpdateProfileInput }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProfileInput }) =>
      window.electronAPI.profiles.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useDeleteProfile(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.electronAPI.profiles.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useDeleteProfiles(): UseMutationResult<void, Error, string[]> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => window.electronAPI.profiles.bulkDelete(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useImportCookies(): UseMutationResult<
  ImportCookiesResult,
  Error,
  { profileId: string; filePath: string }
> {
  return useMutation({
    mutationFn: ({ profileId, filePath }) =>
      window.electronAPI.profiles.importCookies(profileId, filePath),
  })
}

export function useCreateGroup(): UseMutationResult<
  Group,
  Error,
  CreateGroupInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateGroupInput) =>
      window.electronAPI.groups.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  })
}

export function useCreateProxy(): UseMutationResult<
  Proxy,
  Error,
  CreateProxyInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateProxyInput) =>
      window.electronAPI.proxies.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proxies'] }),
  })
}

export function useDeleteProxy(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.electronAPI.proxies.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proxies'] }),
  })
}

export function useTestProxy(): UseMutationResult<
  { ok: boolean; message: string },
  Error,
  string
> {
  return useMutation({
    mutationFn: (id: string) => window.electronAPI.proxies.test(id),
  })
}

export function useStartBrowser(): UseMutationResult<
  BrowserStartResponse,
  Error,
  string
> {
  return useMutation({
    mutationFn: (profileId: string) =>
      window.electronAPI.browser.start(profileId),
  })
}

export function useStopBrowser(): UseMutationResult<
  BrowserStopResponse,
  Error,
  string
> {
  return useMutation({
    mutationFn: (profileId: string) =>
      window.electronAPI.browser.stop(profileId),
  })
}

export function useGenerateFingerprint(): UseMutationResult<
  import('@shared/types').Fingerprint,
  Error,
  FingerprintGenerateInput | undefined
> {
  return useMutation({
    mutationFn: (input?: FingerprintGenerateInput) =>
      window.electronAPI.fingerprints.generate(input),
  })
}

export function useApiSettings(): UseQueryResult<LocalApiSettings> {
  return useQuery<LocalApiSettings>({
    queryKey: ['api-settings'],
    queryFn: () => window.electronAPI.api.getSettings(),
  })
}

export function useUpdateApiSettings(): UseMutationResult<
  LocalApiUpdateResult,
  Error,
  LocalApiPatch
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: LocalApiPatch) =>
      window.electronAPI.api.updateSettings(patch),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['api-settings'] }),
  })
}

export function useTestApiStatus(): UseMutationResult<
  { ok: boolean; message: string },
  Error,
  void
> {
  return useMutation({
    mutationFn: () => window.electronAPI.api.testStatus(),
  })
}

export function useCamoufoxStatus(): UseQueryResult<CamoufoxStatus> {
  return useQuery<CamoufoxStatus>({
    queryKey: ['camoufox-status'],
    queryFn: () => window.electronAPI.camoufox.status(),
  })
}

export function useDownloadCamoufoxCurrent(): UseMutationResult<
  CamoufoxDownloadResult,
  Error,
  void
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.electronAPI.camoufox.downloadCurrent(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['camoufox-status'] }),
  })
}

export type BrowserStartResult = BrowserStartResponse
export type BrowserSessionResult = Session
