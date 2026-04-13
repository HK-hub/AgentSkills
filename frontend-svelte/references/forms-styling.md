# Form Handling & Styling

## 5. Form Handling & Validation

### Using shadcn-svelte Forms with sveltekit-superforms

```svelte
<script lang="ts">
  import { z } from 'zod';
  import { superForm } from 'sveltekit-superforms/client';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import type { PageData } from './$types';

  export let data: PageData;

  const schema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string()
  }).refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword']
  });

  const { form, errors, enhance, delayed } = superForm(data.form, {
    validators: zodClient(schema),
    resetForm: false,
    onUpdated: ({ form }) => {
      if (form.valid) {
        toast.success('Registration successful!');
      }
    }
  });
</script>

<form method="POST" use:enhance>
  <div class="space-y-4">
    <div>
      <Label for="email">Email</Label>
      <Input
        id="email"
        type="email"
        name="email"
        bind:value={$form.email}
        aria-invalid={!!$errors.email}
      />
      {#if $errors.email}
        <p class="text-sm text-destructive">{$errors.email}</p>
      {/if}
    </div>

    <div>
      <Label for="password">Password</Label>
      <Input
        id="password"
        type="password"
        name="password"
        bind:value={$form.password}
        aria-invalid={!!$errors.password}
      />
      {#if $errors.password}
        <p class="text-sm text-destructive">{$errors.password}</p>
      {/if}
    </div>

    <div>
      <Label for="confirmPassword">Confirm Password</Label>
      <Input
        id="confirmPassword"
        type="password"
        name="confirmPassword"
        bind:value={$form.confirmPassword}
        aria-invalid={!!$errors.confirmPassword}
      />
      {#if $errors.confirmPassword}
        <p class="text-sm text-destructive">{$errors.confirmPassword}</p>
      {/if}
    </div>

    <Button type="submit" disabled={$delayed}>
      {$delayed ? 'Registering...' : 'Register'}
    </Button>
  </div>
</form>
```

---

## 6. Styling with Tailwind CSS

### Tailwind Configuration

```javascript
// tailwind.config.js
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        // ... more colors
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: []
};
```

### Component Styling Patterns

```svelte
<script lang="ts">
  import { cn } from '$lib/utils';

  let className: string = '';
  export { className as class };

  export let variant: 'default' | 'outline' = 'default';
  export let size: 'sm' | 'md' | 'lg' = 'md';
</script>

<button
  class={cn(
    'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    {
      'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
      'border border-input hover:bg-accent': variant === 'outline',
    },
    {
      'h-8 px-3 text-sm': size === 'sm',
      'h-10 px-4': size === 'md',
      'h-12 px-6 text-lg': size === 'lg',
    },
    className
  )}
  {...$$restProps}
>
  <slot />
</button>
```
