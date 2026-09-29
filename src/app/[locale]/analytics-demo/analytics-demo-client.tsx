'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { TrackImpression } from '@/components/track-impression'
import { useTrackedField } from '@/lib/analytics/use-tracked-field'
import { requestNotificationPermission } from '@/lib/analytics/permissions'
import {
	trackElementClicked,
	trackFilterApplied,
	trackFilterRemoved,
	trackFlowStarted,
	trackFlowStep,
	trackToggleChanged
} from '@/lib/analytics/track'
import { simulatePayment } from './actions'

const PLATFORMS = ['instagram', 'youtube', 'tiktok']

// A worked reference for every client instrumentation primitive plus the
// server process funnel. Read it as documentation, then delete it — it's not
// part of the product. Each button/section is labelled with the event it sends.
export function AnalyticsDemoClient() {
	const [platforms, setPlatforms] = useState<string[]>([])
	const [subscribed, setSubscribed] = useState(false)
	const nameField = useTrackedField({ fieldName: 'display_name', fieldType: 'text' })

	// flow_started — the checkout funnel begins when this screen mounts.
	useEffect(() => {
		trackFlowStarted('checkout')
	}, [])

	function togglePlatform(platform: string) {
		setPlatforms((current) => {
			const next = current.includes(platform)
				? current.filter((p) => p !== platform)
				: [...current, platform]
			if (next.length > current.length) {
				trackFilterApplied({
					filter_name: 'platform',
					filter_type: 'multi_select',
					filter_selection: next
				})
			} else {
				trackFilterRemoved({
					filter_name: 'platform',
					filter_type: 'multi_select',
					filter_cleared: [platform]
				})
			}
			return next
		})
	}

	async function pay() {
		// element_clicked — a primary CTA.
		trackElementClicked({ element_type: 'primary_cta', element_name: 'pay_now' })
		// flow_step_started — a step inside the checkout funnel.
		trackFlowStep({ flow_name: 'checkout', step_name: 'payment' })
		const result = await simulatePayment({ amount: 42, payment_id: crypto.randomUUID() })
		if (result.ok) {
			toast({
				title: 'Payment succeeded',
				description: 'payment_initiated → payment_succeeded sent'
			})
		} else {
			toast({ title: "Couldn't pay", description: result.error, variant: 'destructive' })
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<TrackImpression elementType="section" elementName="demo_intro">
				<Card>
					<CardHeader>
						<CardTitle>Analytics demo</CardTitle>
						<CardDescription>
							Every control here sends a cataloged event. Open PostHog&apos;s activity view to watch
							them land. Delete this route before shipping.
						</CardDescription>
					</CardHeader>
				</Card>
			</TrackImpression>

			<Card>
				<CardHeader>
					<CardTitle>field_changed</CardTitle>
					<CardDescription>Fires once per edit — records the field, not its value.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<Label htmlFor="display_name">Display name</Label>
					<Input id="display_name" placeholder="Type to fire field_changed" {...nameField} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>filter_applied / filter_removed</CardTitle>
					<CardDescription>
						Toggle a platform to add/remove it from the filter selection.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					{PLATFORMS.map((platform) => (
						<Button
							key={platform}
							variant={platforms.includes(platform) ? 'primary' : 'outline'}
							size="sm"
							onClick={() => togglePlatform(platform)}
						>
							{platform}
						</Button>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>toggle_changed</CardTitle>
					<CardDescription>A boolean toggle sends its new state.</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => {
							const next = !subscribed
							setSubscribed(next)
							trackToggleChanged({ toggle_name: 'email_updates', toggle_state: next })
						}}
					>
						Email updates: {subscribed ? 'on' : 'off'}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>permission funnel</CardTitle>
					<CardDescription>permission_prompted → approved/denied.</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => void requestNotificationPermission()}
					>
						Enable notifications
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>flow_step_started + payment process</CardTitle>
					<CardDescription>
						element_clicked + flow_step_started (client), then payment_initiated → payment_succeeded
						(server action).
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={() => void pay()}>Pay now</Button>
				</CardContent>
			</Card>
		</div>
	)
}
